import { USC, USCObject, USCConnectionStartNote, USCConnectionEndNote, USCConnectionTickNote, USCConnectionAttachNote, USCGuideMidpointNote } from "usctool";
import * as snl from "sonolus-pjsekai-engine";
import { distance, getEaseFunction, midpoint, roundTo } from "./math.js";

export function toCyanvasUSC(usc: snl.USC): USC {
    const timeScale: USCObject = { type: 'timeScaleGroup', changes: [] };
    const outObjects: USCObject[] = [ timeScale ];
    for (const obj of usc.objects) {
        switch (obj.type) {
            case "bpm":
                outObjects.push({ type: "bpm", beat: obj.beat, bpm: obj.bpm });
                break;
            case "timeScale":
                let { type, ...timeScaleDef} = obj;
                timeScale.changes.push(timeScaleDef);
                break;
            case "single":
                outObjects.push({ timeScaleGroup: 0, ...obj });
                break;
            case "slide":
                if (obj.active) {
                    let start: USCConnectionStartNote | undefined, end: USCConnectionEndNote | undefined, mids: (USCConnectionTickNote | USCConnectionAttachNote)[] = [];
                    for (const [idx, conn] of obj.connections.entries()) {
                        switch(conn.type) {
                            case "start": 
                            {
                                const { trace, ...noteDef } = conn;
                                start = { timeScaleGroup: 0, judgeType: trace ? "trace" : "normal", ...noteDef };
                                break;
                            }
                            case "end": // End the connection line, can be flicked
                            {
                                const { trace, ...noteDef } = conn;
                                end = { timeScaleGroup: 0, judgeType: trace ? "trace" : "normal", ...noteDef };
                                break;
                            }
                            case "ignore": // Don't give combo but ease into
                            {
                                const { type, ...noteDef } = conn;
                                if (!start) {
                                    start = { type: "start", timeScaleGroup: 0, judgeType: "none", critical: false, ...noteDef };
                                    break;
                                }
                                if (!end && idx === (obj.connections.length - 1)) {
                                    const { ease, ...noEaseDef } = noteDef;
                                    end = { type: "end", timeScaleGroup: 0, judgeType: "none", critical: false, ...noEaseDef };
                                    break;
                                }
                                mids.push({type: 'tick', timeScaleGroup: 0, ...noteDef});
                                break;
                            }
                            case "attach": // Give combo but don't ease
                            {
                                // Even though attach type don't care about lane, size, ease, timeScaleGroup
                                // MMK4CC still read these properties and expected it to exist.
                                const start = obj.connections.slice(undefined, idx).findLast(canEase),
                                end = obj.connections.slice(idx + 1).find(canEaseTo);
                                if (!start || !end)
                                    throw new Error("Attach note missing a start or end connection!");
                                // There're no reason to estimate the position. I just like how nice it looks in the editor.
                                const note = { ...conn, timeScaleGroup: 0, ...estimatePosition(start.ease, start, end, conn.beat), ease: start.ease }
                                mids.push(note);
                                break;
                            }
                            case "tick": // Give combo and ease into
                                mids.push({ timeScaleGroup: 0, ...conn });
                                break;
                            case "hidden": // ???
                            default:
                                console.warn('Invalid slide connection');
                                break;
                        }
                    }
                    if (!start || !end) 
                        throw new Error('Start or end connection missing!');
                    outObjects.push({ type: "slide", critical: obj.critical, connections: [start, ...mids, end] });
                }
                else {
                    const mids: USCGuideMidpointNote[] = [];
                    for (const conn of obj.connections) {
                        switch(conn.type) {
                            case "ignore": 
                                mids.push({ timeScaleGroup: 0, ...conn});
                                break;
                            default:
                                console.warn('Invalid guide connection ' + conn.type);
                                break;
                        }
                    }
                    outObjects.push({ type: "guide", color: obj.critical ? "yellow" : "green", midpoints: mids, fade: "out" });
                }
                break;
            default:
                console.warn(`Unrecognized note type`);
                break;
        }
    }
    return { objects: outObjects, offset: usc.offset }
}

interface BaseNote { lane: number, beat: number, size: number };
type USCConnectionNote = snl.USCConnectionStartNote | snl.USCConnectionEndNote | snl.USCConnectionIgnoreNote | snl.USCConnectionAttachNote | snl.USCConnectionTickNote | snl.USCConnectionHiddenNote;

function canEase(connection: USCConnectionNote): connection is Exclude<USCConnectionNote, snl.USCConnectionAttachNote | snl.USCConnectionHiddenNote | snl.USCConnectionEndNote> {
    switch (connection.type) {
        case "ignore": case "tick": case "start":
            return true;
    }
    return false;
}

function canEaseTo(connection: USCConnectionNote): connection is Exclude<USCConnectionNote, snl.USCConnectionAttachNote | snl.USCConnectionHiddenNote> {
    switch (connection.type) {
        case "ignore": case "tick": case "start": case "end":
            return true;
    }
    return false;
}

function estimatePosition(easeType: 'linear' | 'in' | 'out', start: BaseNote, end: BaseNote, beat: number): { lane: number, size: number } {
    const easeFunc = getEaseFunction(easeType);
    const percentage = distance(beat, start.beat) / distance(end.beat, start.beat),
    leftStart = start.lane - start.size, rightStart = start.lane + start.size,
    leftEnd = end.lane - end.size, rightEnd = end.lane + end.size,
    leftMid = easeFunc(leftStart, leftEnd, percentage),
    rightMid = easeFunc(rightStart, rightEnd, percentage),
    // Limit precision to 1/16 or 0.0625
    midLane = roundTo(midpoint(leftMid, rightMid), 16), 
    midSize = roundTo(distance(rightMid, leftMid) / 2, 16);
    return { lane: midLane, size: midSize };
}
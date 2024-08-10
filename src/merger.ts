import { USC, USCObject, USCBpmChange } from "sonolus-pjsekai-engine";
import { floorTo, roundTo } from "./math";
type seconds = number;

export function uscConcat(uscData: USC[], songDurations: seconds[], songFiller: seconds[]): USC {
    const TPB = 480;
    const songOffset = uscData[0].offset;
    const uscObjects: USCObject[] = [];
    const newFiller = [...songFiller];
    let beatOffset = 0;
    for (let i = 0; i < uscData.length; i++) {
        let [ beatCountMax, beatPM ] = getBeatCount(uscData[i], songDurations[i] - songFiller[i]),
        beatCount = floorTo(beatCountMax, TPB / 8);
        songDurations[i] -= getDuration(beatPM, roundTo(beatCountMax - beatCount, 1000));
        const beatPad = 4 - (beatCount % 4),
            beatTotal = beatCount + beatPad;
        if (beatPad !== 0 && (i + 1) < uscData.length) {
            // To pad the song, we use the filler time of the next song
            const padDur = getDuration(beatPM, beatPad);
            newFiller[i + 1] -= padDur;
        }
        for (let obj of uscData[i].objects) {
            switch(obj.type) {
                case "timeScale":
                case "bpm":
                case "single":
                    obj.beat += beatOffset;
                    break;
                case "slide":
                    for(let conn of obj.connections)
                        conn.beat += beatOffset;
                    break;
            }
        }
        uscObjects.push(...uscData[i].objects);
        beatOffset += beatTotal;
        if (uscData[i].offset !== 0) {
            console.warn('Offset is defined?');
        }
        if (newFiller[i] < 0) {
            console.warn('Negative filler');
        }
    }
    
    let objectOrder = (obj: USCObject): number => {
        switch (obj.type) {
            case "bpm": return 1;
            case "timeScale": return 2;
            case "single": return 3;
            case "slide": return 4;  
            default: return 5;
        }
    }
    uscObjects.sort((objA, objB) => objectOrder(objA) - objectOrder(objB));
    songFiller.splice(0, songFiller.length, ...newFiller);
    return { offset: songOffset, objects: uscObjects};
}

function getDuration(bmp: number, beats: number): number {
    return beats * 60 / bmp;
}

function getBeatCount(usc: USC, totalDuration: seconds): [number, number] {
    const bmpChanges = usc.objects.filter(obj => obj.type === 'bpm') as USCBpmChange[];
    bmpChanges.sort((bmpA, bmpB) => bmpA.beat - bmpB.beat);
    for (let i = 1; i < bmpChanges.length; i++) {
        const beatPassed = bmpChanges[i - 1].beat - bmpChanges[i].beat;
        totalDuration -= beatPassed * 60 / bmpChanges[i - 1].bpm;
    }
    const lastBmpChange = bmpChanges[bmpChanges.length - 1];
    const remainingBeats = lastBmpChange.bpm * totalDuration / 60;
    if (remainingBeats <= 0)
        console.warn('Negative song duration');
    return [ lastBmpChange.beat + remainingBeats, lastBmpChange.bpm ];
}

function getLastBeat(usc: USC) {
    return usc.objects.reduce((maxBeat: number, uscObj) => {
        switch(uscObj.type) {
            case "bpm":
            case "timeScale":
            case "single":
                return Math.max(maxBeat, uscObj.beat);
            case "slide":
                return uscObj.connections.reduce((maxBeat: number, conn) => Math.max(maxBeat, conn.beat), 0);
        }
    }, 0);
}
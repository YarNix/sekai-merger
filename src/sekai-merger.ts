import path from "node:path";
import fs from "node:fs";
import asyncfs from "node:fs/promises";
import zlib from "node:zlib";
import { parse } from "./parser";
import { chartURL, filterSongIds, getSongDuration, listSongIds, musicInfo, musicURL, sortSongList } from "./lookup";
import { getDownloadInfo, saveDownloadInfo } from "./loader";
import { ALL_MUSIC_DIFFICULTY, ALL_MUSIC_VOCAL, ALL_UNIT, MusicDifficulty, MusicVocal, SortType, UnitId } from "./types";
import { susToUSC, uscToLevelData, USC } from "sonolus-pjsekai-engine";
import { uscConcat } from "./merger";
import Ffmpeg from "fluent-ffmpeg";
import { exportSCP } from "./sonolus";
import { floorTo } from "./math";

main().then((msg) => { if (msg) console.error(msg); }, (error) => { console.error(error); });

async function main() {
    const songExt = 'flac', songOutExt = 'mp3';
    // Verify arguments
    const miniHelp = " (use -help for more info)";
    const commandLineArgs = parse(process.argv.slice(2));
    if (commandLineArgs.switch.find(sw => sw.startsWith('h'))) {
        console.info(getHelpMessage());
        return;
    }
    const verbose = commandLineArgs.switch.find(sw => sw.startsWith('v')) != undefined;
    const [ diff, ...paramIds ] = commandLineArgs.args.map(s => s.toLowerCase()) as [MusicDifficulty, ...Array<number>];
    if (diff == undefined)
        return "Must specify a difficulty." + miniHelp;
    if (ALL_MUSIC_DIFFICULTY.includes(diff) == false)
        return `${diff} is not a valid difficulty.${miniHelp}`;
    const filters = Object.fromEntries(commandLineArgs.named['filter']?.split(',')?.map(s => s.split(':', 2)).filter((s): s is [string, string] => s.length == 2) ?? []);
    if (verbose) console.info(`Filters: ${Object.entries(filters).map(([key, value]) => `${key}:${value},`)}`);
    let vocalType: MusicVocal | undefined, forced: boolean = false, artist: string | undefined, unit: UnitId | undefined;
    if (filters.only_vocal && ALL_MUSIC_VOCAL.includes(filters.only_vocal as MusicVocal))
        [vocalType, forced] = [filters.only_vocal as MusicVocal, true];
    else if (filters.vocal && ALL_MUSIC_VOCAL.includes(filters.vocal as MusicVocal))
        [vocalType, forced] = [filters.vocal as MusicVocal, false];
    if (filters.unit && ALL_UNIT.includes(filters.unit as UnitId))
        unit = filters.unit as UnitId;
    artist = filters.artist;
    if (commandLineArgs.named['range']){
        const [min, max] = commandLineArgs.named['range'].split(':', 2).map(Number);
        paramIds.push(...Array.from({length: (max - min) + 1}, (_, i) => i + min));
    }
    else
    if (paramIds.length === 0)
        paramIds.push(...listSongIds());
    else if (!paramIds.every(id => isFinite(id) && id % 1 == 0))
        return `${paramIds} contain non decimal number.${miniHelp}`;
    const unsortedSongList = filterSongIds(paramIds.map(Number), diff, vocalType, forced, artist, unit);
    const sortingType = commandLineArgs.named['sort'], sortAscending = (commandLineArgs.named['sortDir'] ?? 'ascending') === 'ascending' ? true : false;
    const songList = sortingType == undefined ? unsortedSongList : sortingType.split(',').reduceRight((list, sortby) => sortSongList(list, diff, sortby as SortType, sortAscending), unsortedSongList);
    if (songList.length === 0) 
        return "Can't find any song with id that match the difficulty and version specified.";
    else
    {
        console.info(`Found ${songList.length} songs`);
        if (verbose) {
            songList.forEach(([id, vocal], idx) => {
                console.info(`${id}: ${musicInfo(id)?.title ?? 'Untitled'} (${vocal})`);
                return musicInfo(id);
            })
        }
    }
    if (commandLineArgs.switch.find(sw => sw.toLowerCase() === 'delete')) {
        const downloads = getDownloadInfo();
        await Promise.all(
        [...songList.map(([id, vocal]): [boolean, string] => {
            const songDownloads = downloads.songs[vocal] ?? [];
            const index = songDownloads.indexOf(id);
            if (index >= 0)
                songDownloads.splice(index, 1);
            const savePath = path.join('downloads', vocal, id + '.' + songExt);
            return [fs.existsSync(savePath), savePath]
        }),
        ...songList.map(([id]): [boolean, string] => { 
            const chartDownloads = downloads.charts[diff] ?? [];
            const index = chartDownloads.indexOf(id);
            if (index >= 0)
                chartDownloads.splice(index, 1);
            const savePath = path.join('downloads', diff, id + '.sus');
            return [fs.existsSync(savePath), savePath]
        })]
        .filter(([result, _]) => result == true)
        .map(([_, file]) => {
            if (verbose) console.log(`Removing ${file}`);
            return asyncfs.rm(file);
        }));
        saveDownloadInfo(downloads);
        return;
    }
    let outputLevel = false, outputMusic = true, outputChart = false, outputImport = true;
    switch (commandLineArgs.named['out']) {
        case "level":
            outputMusic = false; outputImport = false;
            break;
        case "music":
            outputImport = false;
            break;
        case "cc_usc":
            [outputImport, outputMusic, outputChart] = [false, false, true];
            break;
        case "scp":
        case undefined:
            break;
        default:
            return `Unregcognized output type: ${commandLineArgs.named['out']}.${miniHelp}`;
    }
    const namePrefix = commandLineArgs.named['prefix'];
    const getOutName = () => (namePrefix ? namePrefix + '-' : '') + `${diff}-merged`;
    // Downloading neccessary content
    const downloads = getDownloadInfo();
    const promises: Promise<void>[] = [];
    for (const [id, vocal] of songList) {
        const songDownloads = downloads.songs[vocal] ?? []; downloads.songs[vocal] = songDownloads;
        if (!songDownloads.includes(id)) {
            const saveDir = path.join('downloads', vocal);
            if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
            const resp = await fetch(musicURL(id, vocal, songExt));
            if (!resp.ok)
                throw new Error(`Failed to fetch music; id: ${id}, vocal: ${vocal}!\nServer responsed ${resp.status}!`);
            const data = Buffer.from(await resp.arrayBuffer());
            const writePromise = asyncfs.writeFile(path.join(saveDir, id + '.' + songExt), data)
            .then(() => { songDownloads.push(id); console.log(`Saved song id ${id}`); }, rethrowLog('Failed to write data of song id: ' + id));
            promises.push(writePromise);
        }
        const chartDownloads = downloads.charts[diff] ?? []; downloads.charts[diff] = chartDownloads;
        if (!chartDownloads.includes(id)) {
            const saveDir = path.join('downloads', diff);
            if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
            const resp = await fetch(chartURL(id, diff));
            if (!resp.ok)
                throw new Error(`Failed to fetch chart; id: ${id}, difficulty: ${diff}!\nServer responsed ${resp.status}!`);
            const data = await resp.text();
            const writePromise = asyncfs.writeFile(path.join(saveDir, id + '.sus'), data)
            .then(() => { chartDownloads.push(id); console.log(`Saved chart id ${id}`); }, rethrowLog('Failed to write data of chart id: ' + id));
            promises.push(writePromise);
        }
    }
    // Some write may failed but we'll save ones that was successful.
    if (promises.length)
        await Promise.all(promises).then(() => saveDownloadInfo(downloads), rethrow);
    // Load data
    const susDataPromise = Promise.all(songList.map(([id]) => asyncfs.readFile(path.join('downloads', diff, id + '.sus'), { encoding: 'utf8' })));
    const songDurPromise = Promise.all(songList.map(([id, vocal]) => getSongDuration(path.join('downloads', vocal, id + '.' + songExt))));
    const songFiller = songList.map(([id]) => musicInfo(id)!.fillerSec);
    const uscData = (await susDataPromise).map(susData => susToUSC(susData));
    const songDur = await songDurPromise;
    console.log('Merging charts');
    const usc = uscConcat(uscData, songDur, songFiller);
    if (outputLevel) {
        const levelData = JSON.stringify(uscToLevelData(usc));
        await asyncfs.writeFile(getOutName() + '.gz', zlib.gzipSync(levelData), { encoding: 'binary'});
    }
    else
    if (outputChart) {
        const { toCyanvasUSC } = await import("./convert.mjs");
        const nn_uscData = JSON.stringify({ usc: toCyanvasUSC(usc), version: 2 });
        await asyncfs.writeFile(getOutName() + '.usc', nn_uscData, { encoding: 'utf8' });
    }
    if (outputMusic) {
        console.log('Cutting music');
        if (!fs.existsSync('temp'))
            fs.mkdirSync('temp');
        let totalDesync = 0;
        for (const [idx, [id, vocal]] of songList.entries()) {
            const savePath = path.join('temp', id + '.' + songExt);
            await new Promise<string | string[] | null>((resolve, reject) => {
                Ffmpeg()
                .input(path.join('downloads', vocal, id + '.' + songExt))
                .seek(songFiller[idx])
                .duration(songDur[idx])
                .audioBitrate("320k")
                .on("end", resolve)
                .on("error", reject)
                .saveToFile(savePath);
            })
            const actualDur = await getSongDuration(savePath), expectDur = (songDur[idx] - songFiller[idx]),
            DESYNC_TOLERANCE = 0.11; // might need to be test further
            totalDesync += actualDur - expectDur; // positive: late; negative: early
            if (verbose)
                console.info(`Cut song id ${id} with ${(actualDur - expectDur).toFixed(6)} desync. Total: ${totalDesync.toFixed(6)}`);
            if (Math.abs(totalDesync) > DESYNC_TOLERANCE && idx + 1 < songList.length) {
                songDur[idx] -= floorTo(totalDesync, 44100);
                totalDesync = 0;
            }
        }
        console.log('Merging musics (this might take a while)');
        await new Promise((resolve, reject) => {
            const command = Ffmpeg().on('end', resolve).on('error', reject);
            songList.reduce((cmd, [id, _]) => cmd.input(path.join('temp', id + '.' + songExt)), command)
            .mergeToFile(getOutName() + '.' + songOutExt, path.join('temp', 'ffmpeg'));
        }).catch(rethrowLog('Failed merging audio'));
        fs.rmSync('temp', { recursive: true, force: true });
    }
    if (outputImport) {
        console.log('Creating scp file');
        const vocals = forced ? [ vocalType! ] : [...new Set(songList.map(([_, vocal]) => vocal))];
        const zipData = await exportSCP(uscToLevelData(usc), getOutName() + '.' + songOutExt, diff, vocals, artist, unit, commandLineArgs.named['title']);
        await asyncfs.writeFile(getOutName() + '.scp', zipData);
        await asyncfs.rm(getOutName() + '.' + songOutExt);
    }
}

function getHelpMessage() {
    return [
        `Usages: ${path.relative(process.cwd(), process.argv[1])} <difficulty> [ids...]`,
        "Options:",
        `  difficulty:`,
        '        ' + ALL_MUSIC_DIFFICULTY.join(', '),
        "  ids: song ids, if not specified all songs are selected",
        "  --range: select a range of song",
        "    Ex: --range=8:20 select id from 8 to 20",
        `  --filter: specify a filter when selecting songs`,
        "      vocal: specify a vocal type you prefer, if it can't find any, the first available one is picked",
        "      only_vocal: any song that don't match the vocal type will be omitted",
        `      -Available vocal types: ${ALL_MUSIC_VOCAL.join(', ')}`,
        "      artist: the composer, arranger, lyricist, ect.",
        "      unit: the game unit/group",
        `      -Available units: ${ALL_UNIT.join(', ')}`,
        "      -You can chain filter with comma. ie. --filter=vocal:sekai,artist:wowaka",
        "  --sort: change the sort type of ids",
        "      none: default if not specified, the order is determined by the database or by argument pass in",
        "      id: the song id",
        "      level: play level, the difficulty number",
        "      release: release date",
        "      -You can chain sort with comma. ie. --sort=rank,id,release",
        "  --sortDir: change the sort direction",
        "      ascending: default",
        "      descending:",
        "  --out: specify the output type, by default output music and level data",
        "      scp: Sonolus package file to import, this the default option",
        "      level: level data that can be use by pjsekai-engine",
        "      music: the songs",
        "      cc_usc: .usc that be open by MikuMikuWorld4CC",
        "  --prefix: add a prefix to the output files",
        "  --title: set the title for the generated level",
        "  -delete: makes the program delete downloaded content instead of output",
        "  -verbose: make the program print out each steps",
        "  -help: print the help message"
    ].join('\n');
}

function rethrowLog(message?: string) {
    return (error?: any) => {
        if (message) console.log(message);
        throw error;
    };
}

function rethrow<T>(error?: any): T {
    throw error;
} 
import { loadFromDB } from "./loader";
import { IMusicInfo, IMusicDifficultyInfo, IMusicVocalInfo, MusicDifficulty as Difficulty, MusicVocal as Vocal, SortType } from "./types";
import Ffmpeg from "fluent-ffmpeg";
const HOST = "https://storage.sekai.best/sekai-jp-assets";
const MUSIC_PATH = "music/long";
const CHART_PATH = "music/music_score";

export function chartURL(musicId: number, diff: Difficulty): string {
    const musicDifficulties = loadFromDB<IMusicDifficultyInfo>('musicDifficulties');
    const fmt = new Intl.NumberFormat(undefined, { minimumIntegerDigits: 4, useGrouping: false });
    if (!musicDifficulties)
        throw new Error('Database for chart data not found!');
    if (musicDifficulties.findIndex((d) => d.musicId === musicId && d.musicDifficulty === diff) < 0)
        throw new Error(`Can't find the chart requested. id: ${musicId}, difficulty: ${diff}`);
    return `${HOST}/${CHART_PATH}/${fmt.format(musicId)}_01_rip/${diff}.txt`;
}

export function musicURL(musicId: number, vocalType: Vocal | undefined = undefined, ext: 'mp3' | 'flac' | undefined = undefined): string {
    if (ext == undefined) ext = 'mp3';
    const musicVocals = loadFromDB<IMusicVocalInfo>('musicVocals');
    if (!musicVocals)
        throw new Error('Database for music data not found!');
    const vocal = vocalType != undefined ? musicVocals.find(v => v.musicId === musicId && v.musicVocalType === vocalType) : musicVocals.find(v => v.musicId === musicId);
    if (!vocal)
        throw new Error(`Can't find the music requested. id: ${musicId}` + (vocalType != undefined ? ` vocal: ${vocalType}` : ''));
    const assetName = vocal.assetbundleName;
    return `${HOST}/${MUSIC_PATH}/${assetName}_rip/${assetName}.${ext}`;
}

export function musicInfo(musicId: number): IMusicInfo | undefined {
    const musics = loadFromDB<IMusicInfo>('musics');
    return musics?.find(m => m.id === musicId);
}

export function listSongIds(): number[] {
    const musics = loadFromDB<IMusicInfo>('musics');
    if (!musics)
        throw new Error('Database for music data not found!');
    return musics.map(({id}) => id);
}

export function filterSongIds(ids: number[], diff: Difficulty, vocalType: Vocal | undefined = undefined, forced: boolean = false): Array<[number, Vocal]> {
    const musicVocals = loadFromDB<IMusicVocalInfo>('musicVocals');
    const musicDifficulties = loadFromDB<IMusicDifficultyInfo>('musicDifficulties');
    if (!musicVocals || !musicDifficulties)
        throw new Error('Database for music data not found!');
    return ids
    .map((id): [number, Vocal] | undefined => {
        if (!musicDifficulties.find(({musicId, musicDifficulty}) => id === musicId && diff === musicDifficulty))
            return;
        const vocalOptions = musicVocals.filter(({musicId, musicVocalType}) => id === musicId && (vocalType === musicVocalType || vocalType == undefined || forced === false));
        const priorityOption = vocalOptions.find(({musicVocalType}) => vocalType === musicVocalType || vocalType == undefined);
        if (!priorityOption && forced)
            return;
        if (vocalOptions.length == 0)
            return
        return [id, vocalOptions[0].musicVocalType as Vocal];
    })
    .filter((value): value is [number, Vocal] => value != undefined);
}

export function sortSongList(songList: Array<[number, Vocal]>, diff: Difficulty, sortby: SortType, ascending: boolean = true): Array<[number, Vocal]> {
    if (sortby == undefined || sortby.length == 0 || sortby === 'none')
        return songList;
    const sortNumber = (a: number, b: number) => ascending ? a - b : b - a;
    switch (sortby) {
        case "id":
            return songList.toSorted(([idA], [idB]) => sortNumber(idA, idB));
        case "rank":
            {
                const musicDifficulties = loadFromDB<IMusicDifficultyInfo>('musicDifficulties');
                if (!musicDifficulties)
                    throw new Error('Database for chart difficulty not found!');
                const getPlayLevel = (id: number, diff: Difficulty) => musicDifficulties.find(({ musicId, musicDifficulty }) => musicId == id && musicDifficulty == diff)!.playLevel;
                return songList.toSorted(([idA], [idB]) => sortNumber(getPlayLevel(idA, diff), getPlayLevel(idB, diff)));
            }
        case "release":
            {
                const musics = loadFromDB<IMusicInfo>('musics');
                if (!musics)
                    throw new Error('Database for music data not found!');
                const getPublishedAt = (id: number) => musics.find(m => m.id == id)!.publishedAt;
                return songList.toSorted((([idA], [idB]) => sortNumber(getPublishedAt(idA), getPublishedAt(idB))));
            }
        default:
            throw new Error(`Unknown sort type ${sortby}`);
    }
}

export function getSongDuration(mediaFile: string): Promise<number> {
    return new Promise<number>((resolve, reject) => Ffmpeg.ffprobe(mediaFile, (err, data) => {
        if (err) { reject('Failed reading file metadata!'); return; }
        if (!data.format.duration) { reject('No duration information found.'); return; }
        resolve(data.format.duration);
    }))
}
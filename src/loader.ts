import fs from 'node:fs';
import path from 'node:path';
import { MusicDifficulty, MusicVocal } from './types';

let loaded_db: Map<string, any[]> | undefined;
export function loadFromDB<T>(name: string): T[] | undefined {
    if (!loaded_db) loaded_db = new Map<string, any[]>();
    if (loaded_db.has(name))
        return loaded_db.get(name) as T[];
    const dataPath = path.join(__dirname, '..', 'sekai-master-db-diff', `${name}.json`);
    if (!fs.existsSync(dataPath))
        return;
    const data = JSON.parse(fs.readFileSync(dataPath, { encoding: 'utf8' }));
    if (!Array.isArray(data))
        return;
    loaded_db.set(name, data);
    return data as T[];
}

type DownloadInfo = { songs: { [key in MusicVocal]?: number[] | undefined }, charts: { [key in MusicDifficulty]?: number[] } };
const DOWNLOAD_SAVE = 'downloads.json';
export function getDownloadInfo(): DownloadInfo {
    if (!fs.existsSync(DOWNLOAD_SAVE))
        return { songs: {}, charts: {} };
    return JSON.parse(fs.readFileSync(DOWNLOAD_SAVE, { encoding: 'utf-8'}));
}

export function saveDownloadInfo(info: DownloadInfo) {
    fs.writeFileSync(DOWNLOAD_SAVE, JSON.stringify(info));
}
import { PathLike } from "node:fs";
import asyncfs from "node:fs/promises"
import JSZip from "jszip";
import { SonolusCollectionPackage, SectionItemTypes, SonolusCollection, MusicDifficulty, MusicVocal, SectionItems } from "./types";
import path, {  } from "node:path"
import { EngineItem, LevelData, LevelItem, ServerItemDetails, compress, hash } from "@sonolus/core";

export async function exportSCP(lvlData: LevelData, lvlBGMPath: PathLike, difficulty: MusicDifficulty, vocals: MusicVocal[]) {
    const zip = new JSZip();
    const ZIP_EXPORT_ERROR = new Error("Something went wrong while exporting. Can't create folder.");
    {
        const snlPackageZip = zip.folder('sonolus');
        if (!snlPackageZip)
            throw ZIP_EXPORT_ERROR;

        const outLvlData = await compress(lvlData), lvlDataHash = hash(outLvlData);
        const outCover = await asyncfs.readFile(path.join('res', 'default-cover.png')), coverHash = hash(outCover);
        const outBGM = await asyncfs.readFile(lvlBGMPath), BGMHash = hash(outBGM);

        const repoZip = snlPackageZip.folder('repository');
        if (!repoZip)
            throw ZIP_EXPORT_ERROR;
        repoZip.file(lvlDataHash, outLvlData);
        repoZip.file(coverHash, outCover);
        repoZip.file(BGMHash, outBGM);

        const levelItem: LevelItem = {
            name: `all-${difficulty}-project-sekai`,
            rating: 99,
            title: `Project Sekai: All Levels`,
            artists: "Multiple Artist",
            author: "Project Sekai: Colorful Stage!",
            tags: [{ title: `#${difficulty.toUpperCase()}` }, ...vocals.map((vocal) => ({ title: `${vocal.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} ver.` }))],
            engine: await CreatePJSKEngine(repoZip),
            useSkin: { useDefault: true },
            useBackground: { useDefault: true },
            useEffect: { useDefault: true },
            useParticle: { useDefault: true },
            cover: { hash: coverHash, url: `/sonolus/repository/${coverHash}` },
            bgm: { hash: BGMHash, url: `/sonolus/repository/${BGMHash}` },
            data: { hash: lvlDataHash, url: `/sonolus/repository/${lvlDataHash}`},
            version: 1
        }
        const MakeCollection = <T extends SectionItems>(type: SectionItemTypes, ...items: T[]): SonolusCollection<T> =>
            ({
                info: { sections: [{itemType: type, title: "#NEWEST", items: [...items]}] },
                list: { items: [...items], pageCount: 1 },
                content: (Object.fromEntries(items.map((i): [string, ServerItemDetails<T>] =>
                    [i.name, {item: i, actions: [], hasCommunity: false, leaderboards: [], sections: [{itemType: type, title: "#NEWEST", items: [] }]}]
                )))
            });
        const snlPackage: SonolusCollectionPackage = {
            info: {
                title: "Project All Levels",
                buttons: [{type:"playlist"}, {type:"level"}, {type:"replay"}, {type:"skin"}, {type:"background"}, {type:"effect"}, {type:"particle"}, {type:"engine"}, {type:"configuration"}],
                configuration: { options: [] }
            },
            package: { },
            content: {
                playlists: MakeCollection('playlist'),
                levels: MakeCollection('level', levelItem),
                replays: MakeCollection('replay'),
                skins: MakeCollection('skin'),
                backgrounds: MakeCollection('background'),
                effects: MakeCollection('effect'),
                particles: MakeCollection('particle'),
                engines: MakeCollection('engine')
            }
        };
        const zipProp = <T>(zipObj: JSZip, obj: T, prop: keyof T) => zipObj.file(prop as string, JSON.stringify(obj[prop]));
        zipProp(snlPackageZip, snlPackage, 'info');
        zipProp(snlPackageZip, snlPackage, 'package');
        for (const [name, collection] of Object.entries(snlPackage.content)) {
            const collectionZip = snlPackageZip.folder(name);
            if(!collectionZip)
                throw ZIP_EXPORT_ERROR;
            zipProp(collectionZip, collection, 'info');
            zipProp(collectionZip, collection, 'list');
            if (!collection.content)
                continue;
            for (const itemName in collection.content)
                zipProp(collectionZip, collection.content, itemName);
        }
    }
    return zip.generateAsync({ type: "nodebuffer" });
}

async function CreatePJSKEngine(repoZip: JSZip): Promise<EngineItem> {
    const resp = await fetch('https://sonolus.sekai.best/sonolus/engines/pjsekai');
    if (!resp.ok) 
        throw new Error('Failed to fetch engine item');
    const engine = JSON.parse(await resp.text()) as ServerItemDetails<EngineItem>;
    return engine.item;
}
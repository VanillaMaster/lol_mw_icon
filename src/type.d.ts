interface RequestInit {
    dispatcher: import("undici").Dispatcher
}

interface RiotIconEntry {
    descriptions: {
        region: string;
        description: string;
    }[];
    disabledRegions: string[];
    id: number;
    imagePath?: string;
    isLegacy: boolean;
    rarities: {
        region: string;
        rarity: number;
    }[];
    title: string;
    yearReleased: number;
}
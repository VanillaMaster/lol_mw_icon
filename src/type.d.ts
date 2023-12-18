interface RequestInit {
    dispatcher?: import("undici").Dispatcher
}

interface RawRiotIconEntry {
    id: number;
    title: string;
    yearReleased: number;
    isLegacy: boolean;
    imagePath?: string;
    descriptions: {
        region: string
        description: string
    }[];
    rarities: {
        region: string
        rarity: number
    }[];
    disabledRegions: string[];
    esportsTeam?: string;
    esportsRegion?: string;
    esportsEvent?: string;
}

interface RiotIconEntry {
    id: number;
    title: string;
    yearReleased: number;
    isLegacy: boolean;
    esportsTeam?: string;
    esportsRegion?: string;
    esportsEvent?: string;
    descriptions: {
        [region: string]: {
            description: string
        }
    }
    rarities: {
        [region: string]: {
            rarity: number
        }
    }
    disabledRegions: string[];
    sets: string[];
    image: {
        mime: string;
    }
}
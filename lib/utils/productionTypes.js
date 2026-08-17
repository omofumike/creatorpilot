// lib/utils/productionTypes.js

export const PRODUCTION_TYPES = {
    CREATOR_VIDEO: 'creator_video',
    SHORT_FILM: 'short_film',
    // DOCUMENTARY: 'documentary', // Not implementing yet as per user instructions
    // ADVERTISEMENT: 'advertisement' // Not implementing yet as per user instructions
};

export const DEFAULT_PRODUCTION_TYPE = PRODUCTION_TYPES.CREATOR_VIDEO;

export const isValidProductionType = (type) => Object.values(PRODUCTION_TYPES).includes(type);

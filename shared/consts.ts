//All uppercase and [0,I,O] removed
const actionIdAlphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const regexDiscordSnowflake = /^\d{17,20}$/;

export default {
    //Identifier stuff
    // regexValidHwidToken: /^[0-9A-Fa-f]{1,2}:[0-9A-Fa-f]{64}$/,
    regexValidHwidToken: /^[0-9A-Fa-f]{1,2}:[0-9A-Fa-f\-:]+$/,

    validIdentifiers: {
        // https://github.com/discordjs/discord.js/pull/9144
        // validated in txtracker dataset
        discord: /^discord:\d{17,20}$/,
        citizenid: /^citizenid:[a-zA-Z0-9]{1,18}$/,
        user: /^user:[a-zA-Z0-9]{1,30}$/,
    },
    validIdentifierParts: {
        discord: regexDiscordSnowflake,
        citizenid: /^[a-zA-Z0-9]{1,18}$/,
        user: /^[a-zA-Z0-9]{1,30}$/,
    },

    // Database stuff
    adminPasswordMinLength: 6,
    adminPasswordMaxLength: 128,
    regexValidFivemUsername: /^\w[\w.-]{1,18}\w$/, //also cant have repeated non-alphanum chars
    regexActionID: new RegExp(`^[${actionIdAlphabet}]{4}-[${actionIdAlphabet}]{4}$`),
    regexWhitelistReqID: new RegExp(`R[${actionIdAlphabet}]{4}`),

    //Other stuff
    regexDiscordSnowflake,
    regexSvLicenseOld: /^\w{32}$/,
    regexSvLicenseNew: /^cfxk_\w{1,60}_\w{1,20}$/,
    regexValidIP: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    actionIdAlphabet,
    nuiWebpipePath: 'https://monitor/WebPipe/',
    regexCustomThemeName: /^[a-z0-9]+(-[a-z0-9]+)*$/
} as const;

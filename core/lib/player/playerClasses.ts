const modulename = 'Player';
import cleanPlayerName from '@shared/cleanPlayerName';
import { DatabaseActionWarnType, DatabasePlayerType, DatabaseWhitelistApprovalsType } from '@modules/Database/databaseTypes';
import { cloneDeep, union } from 'lodash-es';
import { now } from '@lib/misc';
import { parsePlayerIds } from '@lib/player/idUtils';
import consoleFactory from '@lib/console';
import consts from '@shared/consts';
import type FxPlayerlist from '@modules/FxPlayerlist';
const console = consoleFactory(modulename);


/**
 * Base class for ServerPlayer and DatabasePlayer.
 * NOTE: player classes are responsible to every and only business logic regarding the player object in the database.
 * In the future, when actions become part of the player object, also add them to these classes.
 */
export class BasePlayer {
    displayName: string = 'unknown';
    pureName: string = 'unknown';
    ids: string[] = [];
    hwids: string[] = [];
    user: null | string = null; //extracted for convenience
    dbData: false | DatabasePlayerType = false;
    isConnected: boolean = false;

    constructor(readonly uniqueId: Symbol) { }

    /**
     * Mutates the database data based on a source object to be applied
     * FIXME: if this is called for a disconnected ServerPlayer, it will not clean after 120s
     */
    protected mutateDbData(srcData: object) {
        if (!this.user) throw new Error(`cannot mutate database for a player that has no user`);
        this.dbData = txCore.database.players.update(this.user, srcData, this.uniqueId);
    }

    /**
     * Returns all available identifiers (current+db)
     */
    getAllIdentifiers() {
        if (this.dbData && this.dbData.ids) {
            return union(this.ids, this.dbData.ids);
        } else {
            return [...this.ids];
        }
    }

    /**
     * Returns all available hardware identifiers (current+db)
     */
    getAllHardwareIdentifiers() {
        if (this.dbData && this.dbData.hwids) {
            return union(this.hwids, this.dbData.hwids);
        } else {
            return [...this.hwids];
        }
    }

    /**
     * Returns all actions related to all available ids
     * NOTE: theoretically ServerPlayer.setupDatabaseData() guarantees that DatabasePlayer.dbData.ids array
     *  will contain the user but may be better to also explicitly add it to the array here?
     */
    getHistory() {
        if (!this.ids.length) return [];
        return txCore.database.actions.findMany(
            this.getAllIdentifiers(),
            this.getAllHardwareIdentifiers()
        );
    }

    /**
     * Saves notes for this player.
     * NOTE: Techinically, we should be checking this.isRegistered, but not available in BasePlayer
     */
    setNote(text: string, author: string) {
        if (!this.user) throw new Error(`cannot save notes for a player that has no user`);
        this.mutateDbData({
            notes: {
                text,
                lastAdmin: author,
                tsLastEdit: now(),
            }
        });
    }

    /**
     * Saves the whitelist status for this player
     * NOTE: Techinically, we should be checking this.isRegistered, but not available in BasePlayer
     */
    setWhitelist(enabled: boolean) {
        if (!this.user) throw new Error(`cannot set whitelist status for a player that has no user`);
        this.mutateDbData({
            tsWhitelisted: enabled ? now() : undefined,
        });

        //Remove entries from whitelistApprovals & whitelistRequests
        const allIdsFilter = (x: DatabaseWhitelistApprovalsType) => {
            return this.ids.includes(x.identifier);
        }
        txCore.database.whitelist.removeManyApprovals(allIdsFilter);
        txCore.database.whitelist.removeManyRequests({ user: this.user });
    }
}


type PlayerDataType = {
    name: string,
    ids: string[],
    hwids: string[],
}

/**
 * Class to represent a player that is or was connected to the currently running server process.
 */
export class ServerPlayer extends BasePlayer {
    readonly #fxPlayerlist: FxPlayerlist;
    // readonly psid: string; //TODO: calculate player session id (sv mutex, netid, rollover id) here
    readonly netid: number;
    readonly tsConnected = now();
    readonly isRegistered: boolean;
    readonly #minuteCronInterval?: ReturnType<typeof setInterval>;
    // #offlineDbDataCacheTimeout?: ReturnType<typeof setTimeout>;

    constructor(
        netid: number,
        playerData: PlayerDataType,
        fxPlayerlist: FxPlayerlist
    ) {
        super(Symbol(`netid${netid}`));
        this.#fxPlayerlist = fxPlayerlist;
        this.netid = netid;
        this.isConnected = true;
        if (
            playerData === null
            || typeof playerData !== 'object'
            || typeof playerData.name !== 'string'
            || !Array.isArray(playerData.ids)
            || !Array.isArray(playerData.hwids)
        ) {
            throw new Error(`invalid player data`);
        }

        //Processing identifiers
        //NOTE: ignoring IP completely
        const { validIdsArray, validIdsObject } = parsePlayerIds(playerData.ids);
        this.user = validIdsObject.user;
        this.ids = validIdsArray;
        this.hwids = playerData.hwids.filter(x => {
            return typeof x === 'string' && consts.regexValidHwidToken.test(x);
        });

        //Processing player name
        const { displayName, pureName } = cleanPlayerName(playerData.name);
        this.displayName = displayName;
        this.pureName = pureName;

        //If this player is eligible to be on the database
        if (this.user) {
            this.#setupDatabaseData();
            this.isRegistered = !!this.dbData;
            this.#minuteCronInterval = setInterval(this.#minuteCron.bind(this), 60_000);
        } else {
            this.isRegistered = false;
        }
    }


    /**
     * Registers or retrieves the player data from the database.
     * NOTE: if player has user, we are guaranteeing user will be added to the database ids array
     */
    #setupDatabaseData() {
        if (!this.user || !this.isConnected) return;

        //Make sure the database is ready - this should be impossible
        if (!txCore.database.isReady) {
            console.error(`Players database not yet ready, cannot read db status for player id ${this.displayName}.`);
            return;
        }

        //Check if player is already on the database
        try {
            const dbPlayer = txCore.database.players.findOne(this.user);
            if (dbPlayer) {
                //Updates database data
                this.dbData = dbPlayer;
                this.mutateDbData({
                    displayName: this.displayName,
                    pureName: this.pureName,
                    tsLastConnection: this.tsConnected,
                    ids: union(dbPlayer.ids, this.ids),
                    hwids: union(dbPlayer.hwids, this.hwids),
                });
            } else {
                //Register player to the database
                const toRegister = {
                    user: this.user,
                    ids: this.ids,
                    hwids: this.hwids,
                    displayName: this.displayName,
                    pureName: this.pureName,
                    playTime: 0,
                    tsLastConnection: this.tsConnected,
                    tsJoined: this.tsConnected,
                };
                txCore.database.players.register(toRegister);
                this.dbData = toRegister;
                console.verbose.ok(`Adding '${this.displayName}' to players database.`);
            }
            setImmediate(this.#sendInitialData.bind(this));
        } catch (error) {
            console.error(`Failed to load/register player ${this.displayName} from/to the database with error:`);
            console.dir(error);
        }
    }

    /**
     * Prepares the initial player data and reports to FxPlayerlist, which will dispatch to the server via command.
     * TODO: adapt to be used for admin auth and player tags.
     */
    #sendInitialData() {
        if (!this.isRegistered) return;
        if (!this.dbData) throw new Error(`cannot send initial data for a player that has no dbData`);

        let oldestPendingWarn: undefined | DatabaseActionWarnType;
        const actionHistory = this.getHistory();
        for (const action of actionHistory) {
            if (action.type !== 'warn' || action.revocation.timestamp !== null) continue;
            if (!action.acked) {
                oldestPendingWarn = action;
                break;
            }
        }

        if (oldestPendingWarn) {
            this.#fxPlayerlist.dispatchInitialPlayerData(this.netid, oldestPendingWarn);
        }
    }

    /**
     * Sets the dbData.
     * Used when some other player instance mutates the database and we need to sync all players 
     * with the same user.
     */
    syncUpstreamDbData(srcData: DatabasePlayerType) {
        this.dbData = cloneDeep(srcData)
    }

    /**
     * Returns a clone of this.dbData.
     * If the data is not available, it means the player was disconnected and dbData wiped to save memory,
     * so start an 120s interval to wipe it from memory again. This period can be considered a "cache"
     * FIXME: review dbData optimization, 50k players would be up to 50mb
     */
    getDbData() {
        if (this.dbData) {
            return cloneDeep(this.dbData);
        } else if (this.user && this.isRegistered) {
            const dbPlayer = txCore.database.players.findOne(this.user);
            if (!dbPlayer) return false;

            this.dbData = dbPlayer;
            // clearTimeout(this.#offlineDbDataCacheTimeout); //maybe not needed?
            // this.#offlineDbDataCacheTimeout = setTimeout(() => {
            //     this.dbData = false;
            // }, 120_000);
            return cloneDeep(this.dbData);
        } else {
            return false;
        }
    }


    /**
     * Updates dbData play time every minute
     */
    #minuteCron() {
        //FIXME: maybe use UIntXarray or mnemonist.Uint16Vector circular buffers to save memory
        //TODO: rough draft of a playtime tracking system written before note above
        // let list: [day: string, mins: number][] = [];
        // const today = new Date;
        // const currDay = today.toISOString().split('T')[0];
        // if(!list.length){
        //     list.push([currDay, 1]);
        //     return;
        // }
        // if(list.at(-1)![0] === currDay){
        //     list.at(-1)![1]++;
        // } else {
        //     //FIXME: move this cutoff to a const in the database or playerlist manager
        //     const cutoffTs = today.setUTCHours(0, 0, 0, 0) - 1000 * 60 * 60 * 24 * 28; 
        //     const cutoffIndex = list.findIndex(x => new Date(x[0]).getTime() < cutoffTs);
        //     list = list.slice(cutoffIndex);
        //     list.push([currDay, 1]);
        // }


        if (!this.dbData || !this.isConnected) return;
        try {
            this.mutateDbData({ playTime: this.dbData.playTime + 1 });
        } catch (error) {
            console.warn(`Failed to update playtime for player ${this.displayName}:`);
            console.dir(error);
        }
    }


    /**
     * Marks this player as disconnected, clears dbData (mem optimization) and clears minute cron
     */
    disconnect() {
        this.isConnected = false;
        // this.dbData = false;
        clearInterval(this.#minuteCronInterval);
    }
}


/**
 * Class to represent players stored in the database.
 */
export class DatabasePlayer extends BasePlayer {
    readonly isRegistered = true; //no need to check because otherwise constructor throws

    constructor(user: string, srcPlayerData?: DatabasePlayerType) {
        super(Symbol(`db${user}`));
        if (typeof user !== 'string') {
            throw new Error(`invalid player user`);
        }

        //Set dbData either from constructor params, or from querying the database
        if (srcPlayerData) {
            this.dbData = srcPlayerData;
        } else {
            const foundData = txCore.database.players.findOne(user);
            if (!foundData) {
                throw new Error(`player not found in database`);
            } else {
                this.dbData = foundData;
            }
        }

        //fill in data
        this.user = user;
        this.ids = this.dbData.ids;
        this.hwids = this.dbData.hwids;
        this.displayName = this.dbData.displayName;
        this.pureName = this.dbData.pureName;
    }

    /**
     * Returns a clone of this.dbData
     */
    getDbData() {
        return cloneDeep(this.dbData);
    }
}


export type PlayerClass = ServerPlayer | DatabasePlayer;

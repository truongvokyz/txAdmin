import { test, expect, suite, it } from 'vitest';
import * as idUtils from './idUtils';


test('parsePlayerId', () => {
    let result = idUtils.parsePlayerId('USER:555555');
    expect(result.isIdValid).toBe(true);
    expect(result.idType).toBe('user');
    expect(result.idValue).toBe('555555');
    expect(result.idlowerCased).toBe('user:555555');

    result = idUtils.parsePlayerId('user:@@@');
    expect(result.isIdValid).toBe(false);
});

test('parsePlayerIds', () => {
    const result = idUtils.parsePlayerIds(['user:555555', 'user:@@@']);
    expect(result.validIdsArray).toEqual(['user:555555']);
    expect(result.invalidIdsArray).toEqual(['user:@@@']);
    expect(result.validIdsObject?.user).toBe('555555');
});

test('filterPlayerHwids', () => {
    const result = idUtils.filterPlayerHwids([
        '5:55555555000000002d267c6638c8873d55555555000000005555555500000000',
        'invalidHwid'
    ]);
    expect(result.validHwidsArray).toEqual(['5:55555555000000002d267c6638c8873d55555555000000005555555500000000']);
    expect(result.invalidHwidsArray).toEqual(['invalidHwid']);
});

test('parseLaxIdsArrayInput', () => {
    const result = idUtils.parseLaxIdsArrayInput('55555555000000009999, citizenid:123asd, invalid@');
    expect(result.validIds).toEqual(['discord:55555555000000009999', 'citizenid:123asd']);
    expect(result.invalids).toEqual(['invalid@']);
});

test('getIdFromOauthNameid', () => {
    expect(idUtils.getIdFromOauthNameid('https://forum.cfx.re/internal/user/555555')).toBe('user:555555');
    expect(idUtils.getIdFromOauthNameid('xxxxx')).toBe(false);
});

test('shortenId', () => {
    // Invalid ids
    expect(() => idUtils.shortenId(123 as any)).toThrow('id is not a string');
    expect(idUtils.shortenId('invalidFormat')).toBe('invalidFormat');
    expect(idUtils.shortenId(':1234567890123456')).toBe(':1234567890123456');
    expect(idUtils.shortenId('discord:')).toBe('discord:');

    // Valid ID with length greater than >= 10
    expect(idUtils.shortenId('discord:383919883341266945')).toBe('discord:3839…6945');
    
    expect(idUtils.shortenId('citizenid:1234')).toBe('citizenid:1234');
});

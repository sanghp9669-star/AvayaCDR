import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFixedWidthCdrLine, CdrParser } from './cdrParser.ts';

test('CdrParser parses CM4PLUS fixed-width incoming, outgoing, tandem, and ineffective calls', () => {
  const parser = new CdrParser('CM4PLUS');
  const dt = new Date(2026, 10, 12, 14, 30, 0);

  // 1. Incoming trunk call answered (Cond 9)
  const incomingLine = buildFixedWidthCdrLine({
    profile: 'CM4PLUS',
    date: dt,
    durationTenths: 35, // 3.5 min = 210s
    conditionCode: '9',
    accessCode: '801',
    dialedNumber: '3001',
    callingNumber: '0903451289',
    accountCode: 'AC1001',
    trunkGroup: '0001',
    station: '3001',
    ucid: '00001000011731458290',
  });
  const incoming = parser.parseLine(incomingLine);
  assert.equal(incoming.callType, 'incoming');
  assert.equal(incoming.callDurationSec, 210);
  assert.equal(incoming.callingNumber, '0903451289');
  assert.equal(incoming.calledNumber, '3001');
  assert.equal(incoming.trunkGroup, 'TG-1');
  assert.equal(incoming.station, '3001');
  assert.equal(incoming.accountCode, 'AC1001');
  assert.equal(incoming.ucid, '00001000011731458290');

  // 2. Outgoing call with ARS prefix 9 stripped (Cond 0)
  const outgoingLine = buildFixedWidthCdrLine({
    profile: 'CM4PLUS',
    date: dt,
    durationTenths: 15, // 1.5 min = 90s
    conditionCode: '0',
    accessCode: '802',
    dialedNumber: '90987654321',
    callingNumber: '2101',
    trunkGroup: '0002',
    station: '2101',
  });
  const outgoing = parser.parseLine(outgoingLine);
  assert.equal(outgoing.callType, 'outgoing');
  assert.equal(outgoing.callDurationSec, 90);
  assert.equal(outgoing.callingNumber, '2101');
  assert.equal(outgoing.calledNumber, '0987654321');
  assert.equal(outgoing.trunkGroup, 'TG-2');

  // 3. Tandem trunk-to-trunk call (Cond E)
  const tandemLine = buildFixedWidthCdrLine({
    profile: 'CM4PLUS',
    date: dt,
    durationTenths: 10,
    conditionCode: 'E',
    accessCode: '803',
    dialedNumber: '902838221045',
    callingNumber: '0938112299',
    trunkGroup: '0003',
  });
  const tandem = parser.parseLine(tandemLine);
  assert.equal(tandem.callType, 'tandem');
  assert.equal(tandem.trunkGroup, 'TG-3');

  // 4. Ineffective call attempt (Cond 4 - Ring No Answer)
  const ineffectiveLine = buildFixedWidthCdrLine({
    profile: 'CM4PLUS',
    date: dt,
    durationTenths: 0,
    conditionCode: '4',
    accessCode: '801',
    dialedNumber: '90912883401',
    callingNumber: '2102',
    trunkGroup: '0001',
  });
  const ineffective = parser.parseLine(ineffectiveLine);
  assert.equal(ineffective.callType, 'ineffective');
  assert.equal(ineffective.callDurationSec, 0);
});

test('CdrParser supports LEGACY fixed-width profile and UNFORMATTED space-delimited profile', () => {
  const parser = new CdrParser('LEGACY');
  const dt = new Date(2026, 10, 12, 9, 5, 0);

  const legacyLine = buildFixedWidthCdrLine({
    profile: 'LEGACY',
    date: dt,
    durationTenths: 20, // 120s
    conditionCode: '0',
    accessCode: '801',
    dialedNumber: '90901112233',
    callingNumber: '2001',
    accountCode: 'FIN01',
    trunkGroup: '0001',
  });
  const legacyParsed = parser.parseLine(legacyLine, 'LEGACY');
  assert.equal(legacyParsed.formatProfile, 'LEGACY');
  assert.equal(legacyParsed.callDurationSec, 120);
  assert.equal(legacyParsed.callingNumber, '2001');
  assert.equal(legacyParsed.calledNumber, '0901112233');
  assert.equal(legacyParsed.accountCode, 'FIN01');

  const unformattedLine = '111226 0905 00025 9 802 3002 0903451289 AC88 2 00001000011731458290';
  const unformattedParsed = parser.parseLine(unformattedLine, 'UNFORMATTED');
  assert.equal(unformattedParsed.callType, 'incoming');
  assert.equal(unformattedParsed.callDurationSec, 150);
  assert.equal(unformattedParsed.trunkGroup, 'TG-2');
  assert.equal(unformattedParsed.accountCode, 'AC88');
});

test('CdrParser throws descriptive error on malformed or truncated CDR lines', () => {
  const parser = new CdrParser('CM4PLUS');
  assert.throws(() => parser.parseLine('SHORT_LINE'), /too short/);
  assert.throws(() => parser.parseLine('999999 9999 00010 0 801 3001 2001', 'UNFORMATTED'), /Out-of-range/);
});

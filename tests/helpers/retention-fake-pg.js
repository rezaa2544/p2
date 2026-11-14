/* tests/helpers/retention-fake-pg.js — PG ساختگی برایِ tests/partition-retention-mutations.js
   بارگذاری با --require (قبل از ابزار): require('pg') در فرایندِ ابزار جایگزین
   می‌شود — بدونِ PG واقعی. سورسِ ابزار هرگز بازنویسی نمی‌شود (BH-mut). */
'use strict';
if (process.env.RETENTION_FAKE_PG === '1') {
  const Module = require('module');
  const origLoad = Module._load;
  const year = new Date().getFullYear();
  const FAKE_PARTS = [
    'grades_y2017', 'grades_y2018', 'grades_y2019',
    'grades_y' + year, 'grades_default', 'plain_table',
    'attendance_y2019', 'attendance_y' + year, 'attendance_default',
  ];
  Module._load = function (request) {
    if (request === 'pg') {
      return {
        Client: function FakeClient() {
          this.connect = async () => {};
          this.end = async () => {};
          this.query = async (sql) => {
            if (/relkind/.test(sql)) return { rows: [{ k: process.env.RETENTION_FAKE_RELKIND || 'p' }] };
            if (/pg_inherits/.test(sql)) return { rows: FAKE_PARTS.map((relname) => ({ relname })) };
            return { rows: [] };
          };
        },
      };
    }
    return origLoad.apply(this, arguments);
  };
}

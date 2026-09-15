// utils/namibiaHolidays.js

/**
 * Compute Easter Sunday for a given year (Gauss algorithm).
 * Used for Good Friday, Easter Monday, and Ascension Day.
 */
function getEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Return the list of Namibian public holidays for a given year.
 * Each entry: { date: Date, name: string }
 */
function getNamibiaHolidays(year) {
  const easter = getEaster(year);

  const holidays = [
    { date: new Date(year, 0, 1),  name: "New Year's Day" },
    { date: new Date(year, 2, 21), name: 'Independence Day' },
    { date: addDays(easter, -2),   name: 'Good Friday' },
    { date: addDays(easter, 1),    name: 'Easter Monday' },
    { date: new Date(year, 4, 1),  name: "Workers' Day" },
    { date: new Date(year, 4, 4),  name: 'Cassinga Day' },
    { date: new Date(year, 4, 25), name: 'Africa Day' },
    { date: addDays(easter, 39),   name: 'Ascension Day' },
    { date: new Date(year, 7, 26), name: "Heroes' Day" },
    { date: new Date(year, 11, 10), name: 'Human Rights Day' },
    { date: new Date(year, 11, 25), name: 'Christmas Day' },
    { date: new Date(year, 11, 26), name: 'Family Day' }
  ];

  // Normalize dates to midnight
  holidays.forEach(h => h.date.setHours(0, 0, 0, 0));

  // Sort chronologically
  return holidays.sort((a, b) => a.date - b.date);
}

/**
 * Return tomorrow's holiday if tomorrow is a public holiday; otherwise null.
 */
function getTomorrowHoliday() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const holidays = getNamibiaHolidays(tomorrow.getFullYear());
  const tomorrowTime = tomorrow.getTime();

  return holidays.find(h => h.date.getTime() === tomorrowTime) || null;
}

/**
 * Return today's holiday if today is a public holiday; otherwise null.
 */
function getTodayHoliday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const holidays = getNamibiaHolidays(today.getFullYear());
  const todayTime = today.getTime();

  return holidays.find(h => h.date.getTime() === todayTime) || null;
}

module.exports = {
  getNamibiaHolidays,
  getTomorrowHoliday,
  getTodayHoliday
};
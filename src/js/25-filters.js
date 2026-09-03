/* ============================ فیلتر جمع‌شونده (مشترک همه پنل‌ها) ============================ */
/* تا وقتی کاربر روی «فیلترها» نزند، هیچ فیلتری باز نمی‌شود.
   با یک کلیک همه‌ی بخش‌های فیلتر ظاهر می‌شوند. */

S.fopen = S.fopen || {};                       /* وضعیت باز/بسته به تفکیک صفحه */

/* کلیدهای فیلتر هر صفحه — برای شمارش فیلترهای فعال و پاک‌سازی */
const FILTER_KEYS = {
  schools    : ['sp','sc','sd','slevel','sgender','sactive'],
  users      : ['role','school','uactive'],
  subjects   : ['sublevel','subgrade','subbranch','subfield','subschool'],
  grades     : ['subject','term'],
  discipline : ['kind'],
  attendance : ['date'],
  geo        : ['province','county','kind'],
  officedash : ['province','county'],
  offices    : ['province','county'],
  officeschools:['olevel','ogender','okind'],
  exams      : ['term'],
  adminsubs  : ['substatus','subplan'],
  tuition    : ['tstatus'],
  leaves     : ['lstatus'],
};

/* چند فیلتر فعال است؟ (جستجو جدا شمرده نمی‌شود چون همیشه بیرون است) */
function activeFilterCount(route){
  const keys = FILTER_KEYS[route] || [];
  return keys.filter(k => S.filters[k] !== undefined && S.filters[k] !== '' && S.filters[k] !== null).length;
}

/**
 * دکمه‌ی «فیلترها» + پنل جمع‌شونده
 * @param {string} route  کلید صفحه (برای حفظ وضعیت باز/بسته)
 * @param {string} inner  HTML کنترل‌های فیلتر
 */
function filterPanel(route, inner){
  if(!inner || !inner.trim()) return '';
  const n    = activeFilterCount(route);
  const open = !!S.fopen[route];
  return `
  <div class="filter-zone">
    <button class="btn ghost sm filter-toggle${open?' on':''}${n?' has':''}" data-act="filters-toggle" data-key="${escAttr(route)}">
      <span>⚙️</span><span>فیلترها</span>
      ${n?`<span class="badge b-blue sm">${fa(n)}</span>`:''}
      <span class="chev">${open?'▲':'▼'}</span>
    </button>
    ${open?`<div class="filter-body">
      <div class="row" style="gap:8px;flex-wrap:wrap">${inner}</div>
      ${n?`<div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="filters-clear" data-key="${escAttr(route)}">✖️ پاک کردن فیلترها</button></div>`:''}
    </div>`:''}
  </div>`;
}

/* اکشن‌های فیلتر */
const FILTER_ACTIONS = {
  'filters-toggle'(el){
    const k = el.dataset.key;
    S.fopen[k] = !S.fopen[k];
    render();
  },
  'filters-clear'(el){
    const k = el.dataset.key;
    (FILTER_KEYS[k]||[]).forEach(x => { delete S.filters[x]; });
    S.page = 1;
    render();
  },
};

// ═══════════════════════════════════════
// FIREBASE CONFIG & AUTH
// ═══════════════════════════════════════
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBpGeAlMcZtGTkt8JfuPSofArtTkx_XlJE",
    authDomain: "monstea-pos.firebaseapp.com",
    databaseURL: "https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "monstea-pos",
    storageBucket: "monstea-pos.firebasestorage.app",
    messagingSenderId: "742890598182",
    appId: "1:742890598182:web:ce67a7db065fe94b845be7"
};
const APP_PASSWORDS = {'060997':{role:'owner',name:'Chủ quán'}};
let currentRole = null;
let currentStaffId = null;
let currentStaffName = '';
let firebaseDb = null;
let syncTimeout = null;
let isRemoteUpdate = false;
let firebaseReady = false;
let lastHelpTs = 0;

// ═══════════════════════════════════════
// DEFAULT DATA — moved to data.js
// ═══════════════════════════════════════

let state = {
    menu:[...DEFAULT_MENU], categories:['Trà sữa','Trà trái cây','Đồ chiên','Ăn vặt','Khác'],
    staff:[...DEFAULT_STAFF], ingredients:[...DEFAULT_INGREDIENTS],
    recipes:{},
    recipeTemplates:[],
    currentOrder:[], todayInvoices:[], grabOrders:[], history:{}, attendance:{}, editLog:[],
    purchases:{}, expenses:{}, dailyNotes:[],
    openChecklist:DEFAULT_OPEN_CL.map((t,i)=>({id:i+1,text:t,checked:false})),
    closeChecklist:DEFAULT_CLOSE_CL.map((t,i)=>({id:i+1,text:t,checked:false})),
    checklistDate:'', nextMenuId:13, nextStaffId:5, nextInvoiceId:1, nextClId:20, nextIngId:125, nextTplId:1,
    nextPurchaseId:1, nextExpenseId:1,
    shopName:'Monstea', password:'1234',
    ownerPassword:'060997',
    weekSchedule:{},
    menuGuides:{},
    guideImages:{}
};

let posCategory='Tất cả', dashFilter='today';
let scheduleWeekOffset = 0;
let grabCurrentItems = [];
let expenseViewDate = null;
const lockedTabs = ['settings','inventory','recipes'];
let unlockedTabs = {};

// ═══════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════
function today(){return new Date().toISOString().slice(0,10)}
function nowTime(){return new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
function nowHour(){return new Date().getHours()}
function saveState(){try{localStorage.setItem('monsteaPOS',JSON.stringify(state));if(!isRemoteUpdate&&firebaseReady)saveStateToFirebase();}catch(e){}}
function loadState(){try{const s=localStorage.getItem('monsteaPOS');if(s){const p=JSON.parse(s);state={...state,...p};if(!state.ingredients)state.ingredients=[...DEFAULT_INGREDIENTS];if(!state.recipes)state.recipes={};if(!state.recipeTemplates)state.recipeTemplates=[];if(!state.editLog)state.editLog=[];if(!state.password)state.password='1234';if(!state.nextIngId)state.nextIngId=125;if(!state.nextTplId)state.nextTplId=1;if(!state.purchases)state.purchases={};if(!state.expenses)state.expenses={};if(!state.dailyNotes)state.dailyNotes=[];
if(!Array.isArray(state.todayInvoices))state.todayInvoices=[];
if(!Array.isArray(state.grabOrders))state.grabOrders=[];
if(!Array.isArray(state.currentOrder))state.currentOrder=[];
// Migrate staff: add password+wageRate if missing
state.staff.forEach((s,i)=>{if(!s.password)s.password=String((i+1)*1000);if(!s.wageRate)s.wageRate=25000;});
if(!state.weekSchedule)state.weekSchedule={};
if(!state.ownerPassword)state.ownerPassword='060997';
if(!state.menuGuides)state.menuGuides={};
if(!state.guideImages)state.guideImages={};
if(!state.manualUsage)state.manualUsage={};
// Ensure all ingredients have sln/openStock/warnLevel
state.ingredients.forEach(i=>{if(i.sln===undefined)i.sln=1;if(i.openStock===undefined)i.openStock=0;if(i.warnLevel===undefined)i.warnLevel=0;if(i.hidden===undefined)i.hidden=false;});
// Fix: recalculate nextIds from actual max IDs to prevent duplicates
if(state.menu.length>0)state.nextMenuId=Math.max(state.nextMenuId||0,...state.menu.map(m=>m.id))+1;
if(state.staff.length>0)state.nextStaffId=Math.max(state.nextStaffId||0,...state.staff.map(s=>s.id))+1;
if(state.ingredients.length>0)state.nextIngId=Math.max(state.nextIngId||0,...state.ingredients.map(i=>i.id))+1;
// Fix: auto-deduplicate menu items with same ID
const seenIds={};let hadDups=false;
for(let i=state.menu.length-1;i>=0;i--){
  const m=state.menu[i];
  if(seenIds[m.id]!==undefined){
    hadDups=true;
    const orig=state.menu[seenIds[m.id]];
    if(m.name===orig.name){
      if(m.price!==orig.price)orig.price=m.price;
      state.menu.splice(i,1);
      for(const k in seenIds){if(seenIds[k]>i)seenIds[k]--;}
    }else{
      m.id=state.nextMenuId++;
    }
  }else{
    seenIds[m.id]=i;
  }
}
if(hadDups){saveState();console.log('[POS] Auto-fixed duplicate menu IDs');}
}}catch(e){}}

// ═══════════════════════════════════════
// LOGIN & ROLE
// ═══════════════════════════════════════
function attemptLogin(){const p=document.getElementById('loginPwd').value;
if(p===state.ownerPassword){currentRole='owner';currentStaffId=null;currentStaffName='Chủ quán';
sessionStorage.setItem('monsteaPwd',p);document.getElementById('loginOverlay').style.display='none';document.getElementById('loginError').textContent='';
applyRole();initFirebase();return;}
const staffMatch=state.staff.find(s=>s.password===p);
if(staffMatch){currentRole='staff';currentStaffId=staffMatch.id;currentStaffName=staffMatch.name;
sessionStorage.setItem('monsteaPwd',p);document.getElementById('loginOverlay').style.display='none';document.getElementById('loginError').textContent='';
applyRole();initFirebase();return;}
document.getElementById('loginError').textContent='❌ Sai mật khẩu';document.getElementById('loginPwd').value='';}

function applyRole(){
document.querySelectorAll('.tab-btn').forEach(b=>{const t=b.getAttribute('data-tab');b.style.display=(currentRole==='staff'&&!['pos','attendance','checklist','chitieu','guide'].includes(t))?'none':'';});
const rb=document.getElementById('roleBar'),badge=document.getElementById('roleBadge');
if(rb){rb.style.display='flex';badge.textContent=currentRole==='owner'?'👑 Chủ quán':`👤 ${currentStaffName}`;
badge.style.background=currentRole==='owner'?'rgba(232,166,53,0.15)':'rgba(96,165,250,0.1)';
badge.style.color=currentRole==='owner'?'var(--accent)':'var(--accent-blue)';}
const ahc=document.getElementById('attHistoryCard');if(ahc){ahc.style.display=currentRole==='owner'?'block':'none';if(currentRole==='owner')renderAttHistory();}
const hb=document.getElementById('helpBtn');if(hb)hb.style.display='flex';}

function logout(){currentRole=null;currentStaffId=null;currentStaffName='';firebaseDb=null;firebaseReady=false;sessionStorage.removeItem('monsteaPwd');try{firebase.app().delete();}catch(e){}
document.getElementById('loginOverlay').style.display='flex';document.getElementById('loginPwd').value='';
document.getElementById('roleBar').style.display='none';document.getElementById('helpBtn').style.display='none';
document.querySelectorAll('.tab-btn').forEach(b=>b.style.display='');switchTab('pos');}
function init(){loadState();checkNewDay();renderAll();startClock();if(currentRole)applyRole();}
function renderAll(){renderPOSMenu();renderOrder();renderTodayInvoices();renderGrabSection();renderDashboard();renderAttendance();renderChecklist();renderSettings();renderInventory();renderRecipes();renderWeekSchedule();}



// ═══════════════════════════════════════
// FIREBASE SYNC
// ═══════════════════════════════════════
function mergeFirebaseState(r){
  // ── Snapshot local data BEFORE overwrite ──
  const localInvoices=state.todayInvoices||[];
  const localGrab=state.grabOrders||[];
  const localAttendance=JSON.parse(JSON.stringify(state.attendance||{}));
  const localPurchases=JSON.parse(JSON.stringify(state.purchases||{}));
  const localExpenses=JSON.parse(JSON.stringify(state.expenses||{}));
  const localManualUsage=JSON.parse(JSON.stringify(state.manualUsage||{}));
  const localHistory=JSON.parse(JSON.stringify(state.history||{}));

  // Overwrite state with Firebase (shallow)
  state={...state,...r};

  // ══════════════════════════════════════
  // BIDIRECTIONAL MERGE — union by unique key
  // ══════════════════════════════════════

  // ── 1. Invoices: key = id_date ──
  const remoteInvoices=state.todayInvoices||[];
  const invMap=new Map();
  remoteInvoices.forEach(i=>invMap.set(i.id+'_'+i.date, i));
  localInvoices.forEach(i=>{const k=i.id+'_'+i.date; if(!invMap.has(k))invMap.set(k, i);});
  state.todayInvoices=[...invMap.values()];

  // ── 2. Grab orders: key = time_date ──
  const remoteGrab=state.grabOrders||[];
  const grabMap=new Map();
  remoteGrab.forEach(g=>grabMap.set(g.time+'_'+g.date, g));
  localGrab.forEach(g=>{const k=g.time+'_'+g.date; if(!grabMap.has(k))grabMap.set(k, g);});
  state.grabOrders=[...grabMap.values()];

  // ── 3. Attendance: key = staffId per date ──
  _mergeByDate(state, 'attendance', localAttendance, 'staffId');

  // ── 4. Purchases: key = id per date ──
  _mergeByDate(state, 'purchases', localPurchases, 'id');

  // ── 5. Expenses: key = id per date ──
  _mergeByDate(state, 'expenses', localExpenses, 'id');

  // ── 5b. Manual Usage (xuất kho): key = id per date ──
  _mergeByDate(state, 'manualUsage', localManualUsage, 'id');

  // ── 6. History: keep richer version per date ──
  const remoteHistory=state.history||{};
  Object.keys(localHistory).forEach(d=>{
    if(!remoteHistory[d])remoteHistory[d]=localHistory[d];
    else if(localHistory[d].invoices>remoteHistory[d].invoices)remoteHistory[d]=localHistory[d];
  });
  state.history=remoteHistory;

  // ── Migrate ingredients ──
  if(state.ingredients)state.ingredients.forEach(i=>{if(i.sln===undefined)i.sln=1;if(i.openStock===undefined)i.openStock=0;if(i.warnLevel===undefined)i.warnLevel=0;if(i.hidden===undefined)i.hidden=false;});

  // ── Purge stale invoices ──
  const td=today();state.todayInvoices=(state.todayInvoices||[]).filter(i=>i.date===td);
  localStorage.setItem('monsteaPOS',JSON.stringify(state));
}

// Helper: merge {date: [array]} objects bidirectionally by unique key field
function _mergeByDate(state, field, localData, keyField){
  const remote=state[field]||{};
  const allDates=new Set([...Object.keys(remote),...Object.keys(localData)]);
  allDates.forEach(d=>{
    const rArr=remote[d]||[];
    const lArr=localData[d]||[];
    const map=new Map();
    rArr.forEach(item=>map.set(item[keyField], item));
    lArr.forEach(item=>{if(!map.has(item[keyField]))map.set(item[keyField], item);});
    remote[d]=[...map.values()];
  });
  state[field]=remote;
}

function initFirebase(){
firebase.initializeApp(FIREBASE_CONFIG);firebaseDb=firebase.database();
firebaseDb.ref('.info/connected').on('value',s=>updateSyncStatus(s.val()?'connected':'offline'));
let firstLoad=true;
firebaseDb.ref('state').on('value',snap=>{
const r=snap.val();
if(firstLoad){
  firstLoad=false;
  if(r){isRemoteUpdate=true;mergeFirebaseState(r);isRemoteUpdate=false;}
  firebaseReady=true;listenHelpAlert();init();updateSyncStatus('connected');return;}
if(!r)return;
isRemoteUpdate=true;mergeFirebaseState(r);
renderAll();isRemoteUpdate=false;});}

function saveStateToFirebase(){if(!firebaseDb)return;clearTimeout(syncTimeout);
syncTimeout=setTimeout(()=>{updateSyncStatus('syncing');
firebaseDb.ref('state').set(state).then(()=>updateSyncStatus('connected')).catch(()=>updateSyncStatus('offline'));},500);}

function updateSyncStatus(s){const el=document.getElementById('syncStatus');if(!el)return;
const t={connected:'Đã kết nối',offline:'Mất kết nối',syncing:'Đang đồng bộ...'};
el.innerHTML=`<span class="sync-dot ${s}"></span>${t[s]||s}`;}
function checkNewDay(){const td=today();
// ALWAYS purge stale invoices from other dates (root cause of ghost data)
const before=state.todayInvoices.length;
state.todayInvoices=state.todayInvoices.filter(i=>i.date===td);
if(state.todayInvoices.length!==before)console.log(`[POS] Purged ${before-state.todayInvoices.length} stale invoices from todayInvoices`);
if(state.checklistDate!==td){state.openChecklist.forEach(c=>c.checked=false);state.closeChecklist.forEach(c=>c.checked=false);state.checklistDate=td;
state.nextInvoiceId=state.todayInvoices.length?Math.max(...state.todayInvoices.map(i=>i.id))+1:1;saveState();}
}

function archiveDay(dk,invoices){invoices=invoices.filter(i=>i.date===dk);if(!invoices.length)return;const is={};let tr=0,ct=0,tt=0,staffCount=0,staffOrigTotal=0;const hr={};let ac=0;
invoices.forEach(inv=>{if(inv.cancelled)return;
if(inv.method==='staff'){staffCount++;staffOrigTotal+=(inv.staffOriginalTotal||0);}
else{ac++;tr+=inv.total;if(inv.method==='cash')ct+=inv.total;else tt+=inv.total;
const h=parseInt(inv.time?.split(':')[0]||'0');hr[h]=(hr[h]||0)+inv.total;}
inv.items.forEach(i=>{if(!is[i.name])is[i.name]={qty:0,revenue:0};is[i.name].qty+=i.qty;if(inv.method!=='staff'){is[i.name].revenue+=i.price*i.qty;}
(i.toppings||[]).forEach(t=>{if(!is[t.name])is[t.name]={qty:0,revenue:0};is[t.name].qty+=i.qty;if(inv.method!=='staff'){is[t.name].revenue+=t.price*i.qty;}});});});
state.history[dk]={invoices:ac,totalRevenue:tr,cashTotal:ct,transferTotal:tt,staffOrders:staffCount,staffOriginalTotal:staffOrigTotal,itemsSold:is,hourlyRevenue:hr,grabTotal:(state.grabOrders||[]).filter(g=>g.date===dk).reduce((s,g)=>s+g.grabPrice,0),grabNet:(state.grabOrders||[]).filter(g=>g.date===dk).reduce((s,g)=>s+g.netAmount,0)};}

// ═══════════════════════════════════════
// PASSWORD & TAB SWITCHING
// ═══════════════════════════════════════
function switchTab(tab){
    if(currentRole==='staff'&&!['pos','attendance','checklist','chitieu','guide'].includes(tab)){toast('⚠️ Bạn không có quyền truy cập');return;}
    if(lockedTabs.includes(tab)&&!unlockedTabs[tab]){
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById('tab-'+tab).classList.add('active');
        return;
    }
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('tab-'+tab).classList.add('active');
    if(tab==='dashboard')renderDashboard();
    if(tab==='attendance')renderAttendance();
    if(tab==='checklist')renderChecklist();
    if(tab==='inventory')renderInventory();
    if(tab==='chitieu')renderExpenseTab();
    if(tab==='recipes')renderRecipes();
    if(tab==='guide')renderGuide();
}

function unlockTab(tab){
    const pwdInputs={settings:'setPwd',inventory:'invPwd',recipes:'recPwd'};
    const pwd=document.getElementById(pwdInputs[tab]).value;
    if(pwd===state.password){
        unlockedTabs[tab]=true;
        document.getElementById(tab+'Lock').style.display='none';
        document.getElementById(tab+'Content').style.display='block';
        if(tab==='settings')renderSettings();
        if(tab==='inventory')renderInventory();
        if(tab==='recipes')renderRecipes();
        toast('🔓 Đã mở khóa!');
    } else { toast('❌ Sai mật khẩu'); }
}

function changePassword(){
    const np=document.getElementById('newPwd').value.trim();
    if(!np||np.length<4){toast('⚠️ Mật khẩu tối thiểu 4 ký tự');return;}
    state.password=np;saveState();document.getElementById('newPwd').value='';toast('✅ Đã đổi mật khẩu tab');
}
function changeOwnerPassword(){
    const np=document.getElementById('ownerPwdInput').value.trim();
    if(!np||np.length<4){toast('⚠️ Mật khẩu tối thiểu 4 ký tự');return;}
    const dup=state.staff.find(s=>s.password===np);
    if(dup){toast(`⚠️ Trùng pass NV "${dup.name}"`);return;}
    state.ownerPassword=np;saveState();
    sessionStorage.setItem('monsteaPwd',np);
    document.getElementById('ownerPwdInput').value='';
    toast('✅ Đã đổi mật khẩu chủ quán');
}

// ═══════════════════════════════════════
// POS
// ═══════════════════════════════════════
function getMenuVisual(m){
    const img=MENU_IMAGES[m.name];
    if(img){
        const isL=m.name.endsWith(' L')||m.name.includes('(đặc biệt)')||m.price>=50000;
        return `<img class="mi-img${isL?' mi-img-l':''}" src="${IMG_BASE}${img}" alt="" loading="lazy" onerror="this.style.display='none'">`;
    }
    const emoji=TOPPING_EMOJI[m.name];
    if(emoji) return `<span class="mi-emoji">${emoji}</span>`;
    return '';
}
function renderPOSMenu(){
    const ct=document.getElementById('posCatTabs');
    ct.innerHTML=['Tất cả',...state.categories].map(c=>`<button class="cat-btn ${c===posCategory?'active':''}" onclick="setPosCategory('${c}')">${c}</button>`).join('');
    const g=document.getElementById('posMenuGrid');
    const searchVal=(document.getElementById('menuSearch')?.value||'').trim().toLowerCase();
    let items=state.menu.filter(m=>m.active&&!m.isGuide&&(posCategory==='Tất cả'||m.category===posCategory));
    // Build global numbering (across all active items)
    const allActive=state.menu.filter(m=>m.active&&!m.isGuide);
    const numMap={};allActive.forEach((m,idx)=>{numMap[m.id]=idx+1;});
    // Search filter
    if(searchVal){
        const allForSearch=state.menu.filter(m=>m.active&&!m.isGuide);
        const isNum=/^\d+$/.test(searchVal);
        items=allForSearch.filter(m=>{
            if(isNum)return String(numMap[m.id])===searchVal;
            return m.name.toLowerCase().includes(searchVal);
        });
    }
    g.innerHTML=items.map(m=>{const qty=state.currentOrder.reduce((s,o)=>{if(o.menuId===m.id)s+=o.qty;(o.toppings||[]).forEach(t=>{if(t.menuId===m.id)s+=o.qty;});return s;},0);const vis=getMenuVisual(m);const num=numMap[m.id]||'';return `<div class="menu-item-btn ${qty?'mi-badge-active':''}" style="position:relative;" onclick="addToOrder(${m.id})">${qty?`<span class="mi-badge">${qty}</span>`:''}<span class="mi-number">${num}</span>${vis}<div class="mi-name">${esc(m.name)}</div><div class="mi-price">${fmtP(m.price)}</div></div>`;}).join('')||'<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Không tìm thấy</div>';
}
function setPosCategory(c){posCategory=c;document.getElementById('menuSearch').value='';renderPOSMenu();}

// Swipe to change category tabs
(function(){
    let touchStartX=0,touchEndX=0;
    function handleSwipe(){
        const diff=touchStartX-touchEndX;
        if(Math.abs(diff)<50)return;
        const cats=['Tất cả',...(state?.categories||[])];
        const idx=cats.indexOf(posCategory);
        if(diff>0&&idx<cats.length-1)setPosCategory(cats[idx+1]);
        else if(diff<0&&idx>0)setPosCategory(cats[idx-1]);
    }
    document.addEventListener('DOMContentLoaded',()=>{
        const grid=document.getElementById('posMenuGrid');
        if(!grid)return;
        grid.addEventListener('touchstart',e=>{touchStartX=e.changedTouches[0].screenX;},{passive:true});
        grid.addEventListener('touchend',e=>{touchEndX=e.changedTouches[0].screenX;handleSwipe();},{passive:true});
    });
})();
function addToOrder(id){const m=state.menu.find(x=>x.id===id);if(!m)return;
    const isTopping=m.category==='Topping';
    if(isTopping&&state.currentOrder.length>0){
        const last=state.currentOrder[state.currentOrder.length-1];
        if(!last.toppings)last.toppings=[];
        last.toppings.push({menuId:id,name:m.name,price:m.price});
    }else{
        const e=state.currentOrder.find(o=>o.menuId===id&&(!o.toppings||!o.toppings.length));
        if(e)e.qty++;else state.currentOrder.push({menuId:id,name:m.name,price:m.price,qty:1,toppings:[]});
    }
    vibrate(30);renderOrder();renderPOSMenu();}
function changeQty(idx,d){const i=state.currentOrder[idx];if(!i)return;i.qty+=d;if(i.qty<=0)state.currentOrder.splice(idx,1);renderOrder();renderPOSMenu();}
function removeFromOrder(idx){state.currentOrder.splice(idx,1);renderOrder();renderPOSMenu();}
function removeTopping(orderIdx,tIdx){state.currentOrder[orderIdx].toppings.splice(tIdx,1);renderOrder();renderPOSMenu();}
function clearOrder(){state.currentOrder=[];document.getElementById('orderNote').value='';document.getElementById('cashGiven').value='';document.getElementById('changeResult').textContent='';document.getElementById('discountInput').value='';document.getElementById('discountDisplay').textContent='';document.getElementById('finalTotalRow').style.display='none';const md=document.getElementById('mobDiscountInput');if(md)md.value='';const mc=document.getElementById('mobCashGiven');if(mc)mc.value='';const mr=document.getElementById('mobChangeResult');if(mr)mr.textContent='';delete state._editingInvoiceId;delete state._editingOldSummary;document.getElementById('orderTitle').textContent='HÓA ĐƠN MỚI';document.getElementById('orderTitle').style.color='';renderOrder();renderPOSMenu();}
function renderOrder(){const c=document.getElementById('orderItems'),t=document.getElementById('orderTotal'),n=document.getElementById('orderCount');
if(!state.currentOrder.length){c.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.85rem;">Chọn món từ menu bên trái</div>';t.textContent='0đ';n.textContent='0 món';updateMobileBar();return;}
const tq=state.currentOrder.reduce((s,o)=>s+o.qty,0);
const ta=state.currentOrder.reduce((s,o)=>{const tp=(o.toppings||[]).reduce((st,tt)=>st+tt.price,0);return s+(o.price+tp)*o.qty;},0);
c.innerHTML=state.currentOrder.map((o,idx)=>{
    const tp=o.toppings||[];const tpTotal=tp.reduce((s,tt)=>s+tt.price,0);const lineTotal=(o.price+tpTotal)*o.qty;
    const tpHtml=tp.length?`<div style="padding-left:12px;font-size:0.72rem;color:var(--accent-warm);">${tp.map((tt,ti)=>`+ ${esc(tt.name)} <span style="color:var(--text-muted);cursor:pointer;font-size:0.65rem;" onclick="event.stopPropagation();removeTopping(${idx},${ti})">✕</span>`).join('<br>')}</div>`:'';
    return `<div class="order-item" style="flex-wrap:wrap;"><div class="oi-name">${esc(o.name)}${tp.length?` <span style="color:var(--accent-warm);font-size:0.72rem;">(+${tp.length})</span>`:''}</div><div class="oi-qty"><button onclick="changeQty(${idx},-1)">−</button><span>${o.qty}</span><button onclick="changeQty(${idx},1)">+</button></div><div class="oi-price">${fmtP(lineTotal)}</div><span class="oi-del" onclick="removeFromOrder(${idx})">✕</span>${tpHtml}</div>`;
}).join('');
t.textContent=fmtP(ta);n.textContent=tq+' món';calcChange();updateMobileBar();}

function getDiscountAmount(){
const raw=parseInt(document.getElementById('discountInput')?.value)||0;
return raw*1000;
}
function applyDiscount(){
const discount=getDiscountAmount();
const dd=document.getElementById('discountDisplay'),fr=document.getElementById('finalTotalRow'),ft=document.getElementById('finalTotal');
const subtotal=state.currentOrder.reduce((s,o)=>{const tp=(o.toppings||[]).reduce((st,t)=>st+t.price,0);return s+(o.price+tp)*o.qty;},0);
if(discount>0&&subtotal>0){
const final=Math.max(0,subtotal-discount);
dd.textContent='-'+fmtP(discount);
fr.style.display='flex';ft.textContent=fmtP(final);
}else{dd.textContent='';fr.style.display='none';}
calcChange();updateMobileBar();
}

function calcChange(){const subtotal=state.currentOrder.reduce((s,o)=>{const tp=(o.toppings||[]).reduce((st,t)=>st+t.price,0);return s+(o.price+tp)*o.qty;},0);
const discount=getDiscountAmount();
const total=Math.max(0,subtotal-discount);
const raw=parseInt(document.getElementById('cashGiven').value)||0;
const given=raw*1000;
const el=document.getElementById('changeResult');
const mobEl=document.getElementById('mobChangeResult');
if(!raw||!total){el.textContent='';if(mobEl)mobEl.textContent='';return;}
const change=given-total;
if(change>=0){const t='Thối: '+fmtP(change);el.textContent=t;el.style.color='var(--accent-green)';if(mobEl){mobEl.textContent=t;mobEl.style.color='var(--accent-green)';}}
else{const t='Thiếu: '+fmtP(Math.abs(change));el.textContent=t;el.style.color='var(--accent-red)';if(mobEl){mobEl.textContent=t;mobEl.style.color='var(--accent-red)';}}}

function payOrder(method){if(!state.currentOrder.length){toast('⚠️ Chưa có món');return;}
const subtotal=state.currentOrder.reduce((s,o)=>{const tp=(o.toppings||[]).reduce((st,t)=>st+t.price,0);return s+(o.price+tp)*o.qty;},0);
const discount=getDiscountAmount();
const isStaff=method==='staff';
const total=isStaff?0:Math.max(0,subtotal-discount);
if(!isStaff&&window.innerWidth<=768&&!confirm(`Thanh toán ${fmtP(total)} bằng ${method==='cash'?'tiền mặt':'chuyển khoản'}?${discount>0?' (giảm '+fmtP(discount)+')':''}`))return;
if(isStaff&&!confirm(`🏠 Xác nhận đơn nội bộ (${state.currentOrder.reduce((s,o)=>s+o.qty,0)} món — giá gốc ${fmtP(subtotal)})? Giá sẽ = 0đ`))return;
const note=document.getElementById('orderNote').value.trim();
const flatItems=state.currentOrder.map(o=>({menuId:o.menuId,name:o.name,price:o.price,qty:o.qty,toppings:(o.toppings||[]).map(t=>({menuId:t.menuId,name:t.name,price:t.price}))}));
if(state._editingInvoiceId){const eid=state._editingInvoiceId,inv=state.todayInvoices.find(i=>i.id===eid);
if(inv){const os=state._editingOldSummary,ns=flatItems.map(i=>{const tp=(i.toppings||[]).map(t=>t.name).join('+');return `${i.name}${tp?' +'+tp:''}×${i.qty}`;}).join(', ')+` = ${fmtP(total)}`;
if(!state.editLog)state.editLog=[];state.editLog.push({invoiceId:eid,action:'SỬA ĐƠN',time:`${today()} ${nowTime()}`,before:os,after:ns});
inv.items=[...flatItems];inv.total=total;inv.method=method;inv.note=note;inv.edited=true;inv.discount=discount>0?discount:undefined;
toast(`✅ Đã cập nhật #${String(eid).padStart(3,'0')}`);}
delete state._editingInvoiceId;delete state._editingOldSummary;
document.getElementById('orderTitle').textContent='HÓA ĐƠN MỚI';document.getElementById('orderTitle').style.color='';
}else{const inv={id:state.nextInvoiceId++,date:today(),time:nowTime(),hour:nowHour(),items:[...flatItems],total,method,note};
if(discount>0)inv.discount=discount;
if(isStaff)inv.staffOriginalTotal=subtotal;
state.todayInvoices.push(inv);toast(isStaff?`🏠 Nội bộ #${inv.id} — ${state.currentOrder.reduce((s,o)=>s+o.qty,0)} món (0đ)`:`✅ Thanh toán #${inv.id} — ${fmtP(total)}${discount>0?' (giảm '+fmtP(discount)+')':''}`);}
playPaySound();vibrate(100);state.currentOrder=[];document.getElementById('orderNote').value='';document.getElementById('cashGiven').value='';document.getElementById('changeResult').textContent='';document.getElementById('discountInput').value='';document.getElementById('discountDisplay').textContent='';document.getElementById('finalTotalRow').style.display='none';const md=document.getElementById('mobDiscountInput');if(md)md.value='';const mc=document.getElementById('mobCashGiven');if(mc)mc.value='';const mr=document.getElementById('mobChangeResult');if(mr)mr.textContent='';archiveDay(today(),state.todayInvoices);renderOrder();renderPOSMenu();renderTodayInvoices();saveState();}

function renderTodayInvoices(){const c=document.getElementById('todayInvoiceList'),ce=document.getElementById('todayInvCount');
const ti=state.todayInvoices.filter(i=>i.date===today()),tt=ti.filter(i=>!i.cancelled&&i.method!=='staff').reduce((s,i)=>s+i.total,0),sc=ti.filter(i=>!i.cancelled&&i.method==='staff').length;
ce.textContent=`(${ti.filter(i=>!i.cancelled).length} đơn${sc?' ('+sc+' nội bộ)':''} — ${fmtP(tt)})`;
if(!ti.length){c.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Chưa có hóa đơn</div>';return;}
c.innerHTML=[...ti].reverse().map(inv=>{const is=inv.items.map(i=>{const tp=(i.toppings||[]).map(t=>t.name).join('+');return `${i.name}${tp?' +'+tp:''}×${i.qty}`;}).join(', ');
return `<div class="inv-row ${inv.cancelled?'cancelled':''}" onclick="showInvoiceDetail(${inv.id})"><span class="inv-id">#${String(inv.id).padStart(3,'0')}${inv.cancelled?'<span class="inv-badge cancelled-badge">ĐÃ HỦY</span>':''}${inv.edited&&!inv.cancelled?'<span class="inv-badge edited">ĐÃ SỬA</span>':''}${inv.method==='grab'?'<span class="inv-badge" style="background:rgba(96,165,250,0.15);color:var(--accent-blue);">GRAB</span>':''}${inv.method==='staff'?'<span class="inv-badge staff-badge">NỘI BỘ</span>':''}</span><span class="inv-time">${inv.time}</span><span class="inv-items">${esc(is)}</span><span class="inv-method ${inv.method}">${inv.method==='cash'?'💵':inv.method==='grab'?'🏍️':inv.method==='staff'?'🏠':'📱'}</span><span class="inv-total">${inv.cancelled?fmtP(0):fmtP(inv.total)}</span></div>`;}).join('');}

function showInvoiceDetail(id){const td=today();
// Use reverse search to get the LATEST matching invoice (today's, not stale)
const inv=[...state.todayInvoices].reverse().find(i=>i.id===id&&i.date===td);if(!inv)return;
const logs=(state.editLog||[]).filter(l=>l.invoiceId===id&&l.time&&l.time.startsWith(td));
const logS=logs.length?`<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);"><div style="font-size:0.78rem;color:var(--accent);font-weight:600;margin-bottom:8px;">📝 Lịch sử (${logs.length})</div>${logs.map(l=>`<div class="edit-log-item"><div class="log-time">${l.time} — ${l.action}</div><div class="log-detail">${l.before?`<div class="log-before">Trước: ${esc(l.before)}</div>`:''}${l.after?`<div class="log-after">Sau: ${esc(l.after)}</div>`:''}</div></div>`).join('')}</div>`:'';
const invSubTotal=inv.items.reduce((s,i)=>{const tp=(i.toppings||[]).reduce((st,t)=>st+t.price,0);return s+(i.price+tp)*i.qty;},0);
const discLine=inv.discount?`<div style="display:flex;justify-content:space-between;margin-top:6px;padding:6px 0;"><span style="font-size:0.85rem;color:var(--text-muted);">Tạm tính</span><span style="font-size:0.85rem;color:var(--text-muted);">${fmtP(invSubTotal)}</span></div><div style="display:flex;justify-content:space-between;"><span style="font-size:0.88rem;color:var(--accent-purple);">🎁 Giảm giá</span><span style="color:var(--accent-purple);font-weight:700;font-size:0.88rem;">-${fmtP(inv.discount)}</span></div>`:'';
const body=`${inv.cancelled?'<div style="background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.3);border-radius:8px;padding:10px;margin-bottom:12px;color:var(--accent-red);font-weight:600;">🚫 Đã hủy</div>':''}
<div style="margin-bottom:12px;font-size:0.82rem;color:var(--text-muted);">${inv.date} — ${inv.time}</div>
<table style="width:100%;border-collapse:collapse;"><tr style="border-bottom:1px solid var(--border-subtle);"><th style="text-align:left;padding:6px;font-size:0.78rem;color:var(--text-muted);">Món</th><th style="text-align:center;padding:6px;font-size:0.78rem;color:var(--text-muted);">SL</th><th style="text-align:right;padding:6px;font-size:0.78rem;color:var(--text-muted);">Thành tiền</th></tr>
${inv.items.map(i=>{const tpText=(i.toppings||[]).length?' <span style="color:var(--accent-warm);font-size:0.78rem;">+ '+(i.toppings||[]).map(t=>esc(t.name)).join(' + ')+'</span>':'';const tpTotal=(i.toppings||[]).reduce((s,t)=>s+t.price,0);return `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);${inv.cancelled?'text-decoration:line-through;opacity:0.5;':''}"><td style="padding:8px 6px;">${esc(i.name)}${tpText}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;color:var(--accent-warm);">${fmtP((i.price+tpTotal)*i.qty)}</td></tr>`;}).join('')}</table>
<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle);">
${discLine}
<div style="display:flex;justify-content:space-between;${inv.discount?'margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-subtle);':''}"><span style="font-weight:600;">${inv.discount?'THÀNH TIỀN':'Tổng'}</span><span style="font-family:var(--font-display);font-weight:800;font-size:1.2rem;color:${inv.cancelled?'var(--accent-red)':'var(--accent)'};">${inv.cancelled?'0đ':fmtP(inv.total)}</span></div>
</div>
${inv.note?`<div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);">📝 ${esc(inv.note)}</div>`:''}
<div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);">💳 ${inv.method==='cash'?'Tiền mặt':inv.method==='staff'?'🏠 Nội bộ (NV/Người nhà)':'CK'}</div>
${inv.method==='staff'&&inv.staffOriginalTotal?'<div style="margin-top:4px;font-size:0.78rem;color:var(--accent-purple);">💡 Giá gốc: '+fmtP(inv.staffOriginalTotal)+' → Giảm 100%</div>':''}
${logS}
${!inv.cancelled?`<div style="display:flex;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);"><button class="btn btn-primary btn-sm" onclick="editInvoice(${inv.id})" style="flex:1;">✏️ Sửa đơn</button><button class="btn btn-danger btn-sm" onclick="cancelInvoice(${inv.id})" style="flex:1;">🚫 Hủy đơn</button></div>`:''}`;
openModal('Hóa đơn #'+String(inv.id).padStart(3,'0'),body);}

function editInvoice(id){const td=today();const inv=[...state.todayInvoices].reverse().find(i=>i.id===id&&i.date===td);if(!inv||inv.cancelled)return;closeModal();
state.currentOrder=inv.items.map(i=>({...i}));state._editingInvoiceId=id;state._editingOldSummary=inv.items.map(i=>`${i.name}×${i.qty}`).join(', ')+` = ${fmtP(inv.total)}`;
document.getElementById('orderTitle').textContent=`✏️ SỬA #${String(id).padStart(3,'0')}`;document.getElementById('orderTitle').style.color='var(--accent)';
document.getElementById('orderNote').value=inv.note||'';renderOrder();toast(`✏️ Đang sửa #${String(id).padStart(3,'0')}`);}

function cancelInvoice(id){const td=today();
// Find the actual invoice object in the array (not a copy) using index
const idx=state.todayInvoices.findIndex(i=>i.id===id&&i.date===td&&!i.cancelled);
if(idx===-1){toast(`⚠️ Không tìm thấy đơn #${String(id).padStart(3,'0')} hôm nay hoặc đã hủy rồi`);return;}
const inv=state.todayInvoices[idx];
if(!confirm(`Hủy đơn #${String(id).padStart(3,'0')}?`))return;
inv.cancelled=true;if(!state.editLog)state.editLog=[];
state.editLog.push({invoiceId:id,action:'HỦY ĐƠN',time:`${today()} ${nowTime()}`,before:inv.items.map(i=>`${i.name}×${i.qty}`).join(', ')+` = ${fmtP(inv.total)}`,after:'Đã hủy'});
archiveDay(today(),state.todayInvoices);saveState();renderTodayInvoices();closeModal();toast(`🚫 Đã hủy #${String(id).padStart(3,'0')}`);}

function showEditLog(){const td=today();const logs=(state.editLog||[]).filter(l=>l.time&&l.time.startsWith(td));if(!logs.length){openModal('📝 Nhật ký','<div style="text-align:center;padding:20px;color:var(--text-muted);">Hôm nay chưa có thay đổi</div>');return;}
openModal(`📝 Nhật ký hôm nay (${logs.length})`,[...logs].reverse().map(l=>`<div class="edit-log-item"><div class="log-time">🕒 ${l.time} — #${String(l.invoiceId).padStart(3,'0')} — <strong>${l.action}</strong></div><div class="log-detail">${l.before?`<div class="log-before">❌ ${esc(l.before)}</div>`:''}${l.after?`<div class="log-after">✅ ${esc(l.after)}</div>`:''}</div></div>`).join(''));}

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
function setDashFilter(f){dashFilter=f;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));if(f!=='custom')document.querySelector(`.filter-btn[onclick*="${f}"]`)?.classList.add('active');renderDashboard();}

function getDashData(){const td=today();let dates=[];
if(dashFilter==='today')dates=[td];
else if(dashFilter==='week'){for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);dates.push(d.toISOString().slice(0,10));}}
else if(dashFilter==='month'){const now=new Date(),y=now.getFullYear(),m=now.getMonth();for(let d=1;d<=now.getDate();d++)dates.push(new Date(y,m,d).toISOString().slice(0,10));}
else{const p=document.getElementById('dashDatePick').value;dates=p?[p]:[td];}
if(dates.includes(td))archiveDay(td,state.todayInvoices);
let tr=0,ti=0,ct=0,tt=0;const is={},hr={};
dates.forEach(d=>{const dd=state.history[d];if(!dd)return;tr+=dd.totalRevenue;ti+=dd.invoices;ct+=dd.cashTotal||0;tt+=dd.transferTotal||0;
if(dd.itemsSold)Object.entries(dd.itemsSold).forEach(([n,x])=>{if(!is[n])is[n]={qty:0,revenue:0};is[n].qty+=x.qty;is[n].revenue+=x.revenue;});
if(dd.hourlyRevenue)Object.entries(dd.hourlyRevenue).forEach(([h,r])=>{hr[h]=(hr[h]||0)+r;});});
return{dates,totalRevenue:tr,totalInvoices:ti,cashTotal:ct,transferTotal:tt,itemsSold:is,hourlyRevenue:hr};}

function calcIngredientCost(dashData){
    let total=0;
    Object.entries(dashData.itemsSold).forEach(([name,data])=>{
        const mi=state.menu.find(m=>m.name===name);if(!mi)return;
        const recipe=state.recipes[mi.id]||[];
        recipe.forEach(r=>{const ing=state.ingredients.find(i=>i.id===r.ingId);
        if(!ing)return;total+=r.qty*data.qty*ing.unitPrice;});
    });
    return Math.round(total);
}
function calcLaborCost(dates){
    const OT_MULT=1.3,OT_HOUR=22;
    let total=0;
    dates.forEach(d=>{
        const recs=state.attendance[d]||[];
        recs.forEach(r=>{
            if(!r.checkIn||!r.checkOut||!r.hours)return;
            const staff=state.staff.find(s=>s.id===r.staffId);
            const rate=staff?.wageRate||25000;
            const [iH,iM]=r.checkIn.split(':').map(Number);
            const [oH,oM]=r.checkOut.split(':').map(Number);
            const inMin=iH*60+iM, outMin=oH*60+oM;
            const otStart=OT_HOUR*60;
            if(outMin<=otStart){
                total+=r.hours*rate;
            } else if(inMin>=otStart){
                total+=r.hours*rate*OT_MULT;
            } else {
                const normalH=(otStart-inMin)/60;
                const otH=(outMin-otStart)/60;
                total+=normalH*rate + otH*rate*OT_MULT;
            }
        });
    });
    return Math.round(total);
}

function statCard(label, value, color, extra='') {
    return `<div class="stat-card"${extra}><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value}</div></div>`;
}
function renderDashboard(){
    const d=getDashData(), avg=d.totalInvoices?Math.round(d.totalRevenue/d.totalInvoices):0;
    const nlCost=calcIngredientCost(d), nvCost=calcLaborCost(d.dates), gross=d.totalRevenue-nlCost-nvCost;
    let otherExp=0; d.dates.forEach(dt=>{((state.expenses||{})[dt]||[]).forEach(e=>otherExp+=e.amount);});
    document.getElementById('dashStats').innerHTML = [
        statCard('Doanh thu', fmtP(d.totalRevenue), 'var(--accent)'),
        statCard('Hóa đơn', d.totalInvoices, 'var(--accent-blue)'),
        statCard('TB/đơn', fmtP(avg), 'var(--accent-warm)'),
        statCard('Tiền mặt', fmtP(d.cashTotal), 'var(--accent-green)'),
        statCard('CK', fmtP(d.transferTotal), 'var(--accent-purple)'),
        statCard('💰 Chi phí NL', fmtP(nlCost), 'var(--accent-red)', ' style="border-color:rgba(255,107,107,0.2);background:rgba(255,107,107,0.04)"'),
        statCard('👤 Chi phí NV', fmtP(nvCost), 'var(--accent-blue)', ' style="border-color:rgba(96,165,250,0.2);background:rgba(96,165,250,0.04)"'),
        statCard('🧾 CP khác', fmtP(otherExp), '#fbbf24', ' style="border-color:rgba(251,191,36,0.2);background:rgba(251,191,36,0.04)"'),
        statCard('📊 Lãi gộp', fmtP(gross), gross>=0?'var(--accent-green)':'var(--accent-red)', ' style="border-color:rgba(74,222,128,0.25);background:rgba(74,222,128,0.06)"'),
    ].join('');
    renderRevenueChart(); renderHourlyChart(d.hourlyRevenue); renderMonthlyReport();
    const ti=Object.entries(d.itemsSold).map(([n,x])=>({name:n,...x})).sort((a,b)=>b.qty-a.qty), tq=ti.reduce((s,i)=>s+i.qty,0);
    document.getElementById('topItemsBody').innerHTML=ti.length?ti.map((i,x)=>`<tr><td style="color:${x<3?'var(--accent)':'var(--text-muted)'};font-weight:${x<3?700:400}">${x+1}</td><td>${x===0?'🏆 ':''}${esc(i.name)}</td><td style="font-weight:600">${i.qty}</td><td style="color:var(--accent-warm)">${fmtP(i.revenue)}</td><td style="color:var(--text-muted)">${tq?Math.round(i.qty/tq*100):0}%</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">Chưa có dữ liệu</td></tr>';}

function renderRevenueChart(){const c=document.getElementById('revenueChart'),days=[];
for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=d.toISOString().slice(0,10),dn=['CN','T2','T3','T4','T5','T6','T7'];
days.push({k,label:i===0?'Nay':dn[d.getDay()],rev:state.history[k]?.totalRevenue||0});}
const mx=Math.max(...days.map(d=>d.rev),1);
c.innerHTML=days.map(d=>`<div class="bar-col"><div class="bar-value">${d.rev?fmtS(d.rev):''}</div><div class="bar-fill" style="height:${Math.max(4,d.rev/mx*160)}px;${d.label==='Nay'?'background:var(--accent)':''}"></div><div class="bar-label">${d.label}</div></div>`).join('');}

function renderHourlyChart(hr){const c=document.getElementById('hourlyChart'),hours=[];
for(let h=6;h<=23;h++)hours.push({h,rev:hr?.[h]||0});
const mx=Math.max(...hours.map(h=>h.rev),1),pk=hours.reduce((m,h)=>h.rev>m.rev?h:m,hours[0]);
c.innerHTML=hours.map(h=>`<div class="hourly-bar ${h.h===pk.h&&h.rev>0?'peak':''}" style="height:${Math.max(2,h.rev/mx*90)}px" title="${h.h}h: ${fmtP(h.rev)}"></div>`).join('');}

// ═══════════════════════════════════════
// INVENTORY (Kho NL)
// ═══════════════════════════════════════
function calcDailyUsage(date){
    const usage={};const dd=state.history[date];if(!dd||!dd.itemsSold)return usage;
    Object.entries(dd.itemsSold).forEach(([name,data])=>{
        const mi=state.menu.find(m=>m.name===name);if(!mi)return;
        const recipe=state.recipes[mi.id]||[];
        recipe.forEach(r=>{if(!usage[r.ingId])usage[r.ingId]=0;usage[r.ingId]+=r.qty*data.qty;});
    });return usage;
}
function calcTotalPurchased(ingId){
    let total=0;Object.values(state.purchases||{}).forEach(list=>{list.forEach(p=>{if(p.ingId===ingId)total+=p.totalQty;});});return total;
}
function calcAvgDailyUsage(ingId){
    let total=0,days=0;
    for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);const k=d.toISOString().slice(0,10);
    const u=calcDailyUsage(k);if(u[ingId]){total+=u[ingId];days++;}};
    return days?total/days:0;
}
function getStockInfo(ing){
    const purchased=calcTotalPurchased(ing.id);
    let totalUsed=0;Object.keys(state.history||{}).forEach(d=>{const u=calcDailyUsage(d);if(u[ing.id])totalUsed+=u[ing.id];});
    // Tính xuất kho thủ công
    let manualUsed=0;Object.values(state.manualUsage||{}).forEach(list=>{list.forEach(s=>{if(s.ingId===ing.id)manualUsed+=s.qty;});});
    const openStock=ing.openStock||0;
    const stock=Math.round((openStock+purchased-totalUsed-manualUsed)*100)/100;
    const warn=ing.warnLevel||0;
    const avgDaily=Math.round(calcAvgDailyUsage(ing.id)*10)/10;
    const daysLeft=avgDaily>0?Math.round(stock/avgDaily*10)/10:999;
    let status='ok';
    if(warn>0&&stock<=warn)status='danger';
    else if(warn>0&&stock<=warn*2)status='warning';
    else if(daysLeft<=2&&avgDaily>0)status='danger';
    else if(daysLeft<=5&&avgDaily>0)status='warning';
    return{stock,purchased,totalUsed:Math.round((totalUsed+manualUsed)*100)/100,avgDaily,daysLeft,status};
}
function renderInventory(){
    const search=(document.getElementById('ingSearch')?.value||'').toLowerCase();
    const list=state.ingredients.filter(i=>!search||i.name.toLowerCase().includes(search));
    const totalInvValue=state.ingredients.filter(i=>!i.hidden).reduce((sum,i)=>{const s=getStockInfo(i);return sum+s.stock*i.unitPrice;},0);
    document.getElementById('ingCount').innerHTML=`(${state.ingredients.length} nguyên liệu) <span style="margin-left:8px;color:var(--accent);font-weight:700;">💰 ${fmtP(Math.round(totalInvValue))}</span>`;
    const sI={ok:'🟢',warning:'🟡',danger:'🔴'};
    // Need-to-buy card
    const needList=state.ingredients.filter(i=>!i.hidden).map(i=>({...i,s:getStockInfo(i)})).filter(i=>i.s.status==='danger'||i.s.status==='warning');
    const ntbEl=document.getElementById('needToBuyCard');
    if(ntbEl){
      if(!needList.length){ntbEl.innerHTML='';}
      else{
        // Group by supplier
        const groups={};
        needList.forEach(i=>{
          const sup=i.supplier||'Chưa gán NCC';
          if(!groups[sup])groups[sup]=[];
          groups[sup].push(i);
        });
        const groupKeys=Object.keys(groups).sort((a,b)=>a==='Chưa gán NCC'?1:b==='Chưa gán NCC'?-1:a.localeCompare(b));
        let html=`<div style="background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.25);border-radius:var(--radius-md);padding:14px;">`;
        html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-weight:700;font-size:0.85rem;">🛒 Gợi ý nhập hàng (${needList.length})</span><button class="btn btn-secondary btn-sm" onclick="copyNeedToBuyList()" style="font-size:0.68rem;padding:3px 8px;">📋 Copy</button></div>`;
        groupKeys.forEach(sup=>{
          const items=groups[sup];
          const supColor=sup==='Chưa gán NCC'?'var(--text-muted)':'var(--accent-blue)';
          html+=`<div style="margin-bottom:8px;"><div style="font-size:0.75rem;font-weight:700;color:${supColor};margin-bottom:4px;padding:2px 6px;background:rgba(96,165,250,0.08);border-radius:4px;display:inline-block;">📦 ${esc(sup)} (${items.length})</div>`;
          html+=`<div style="display:flex;flex-direction:column;gap:4px;">`;
          items.forEach(i=>{
            const need=Math.max(0,Math.ceil(i.s.avgDaily*7-i.s.stock));const packs=i.sln>1?Math.ceil(need/i.sln):need;
            const packText=i.sln>1?`${packs} gói (×${i.sln})`:`${need} ${i.unit}`;
            const linkHtml=i.supplierLink?`<a href="${esc(i.supplierLink)}" target="_blank" style="font-size:0.68rem;text-decoration:none;">🔗</a>`:'';
            html+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:8px;background:${i.s.status==='danger'?'rgba(255,107,107,0.12)':'rgba(245,158,11,0.08)'}">`;
            html+=`<span style="font-size:0.82rem;">${sI[i.s.status]}</span>`;
            html+=`<span style="flex:1;font-size:0.78rem;font-weight:600;">${esc(i.name)} ${linkHtml}</span>`;
            html+=`<span style="font-size:0.7rem;color:var(--text-muted);">${i.s.stock} ${i.unit}${i.s.daysLeft<999?' (≈'+i.s.daysLeft+'d)':''}</span>`;
            html+=need>0?`<span style="font-size:0.7rem;color:var(--accent-green);font-weight:600;">→ ${packText}</span>`:'';
            html+=`</div>`;
          });
          html+=`</div></div>`;
        });
        html+=`</div>`;
        ntbEl.innerHTML=html;
      }
    }
    // Table with SLN
    let html=`<table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
    <thead><tr style="border-bottom:2px solid var(--border-subtle);text-align:left;">
    <th style="padding:6px 3px;">NL</th><th style="padding:6px 3px;">ĐV</th>
    <th style="padding:6px 3px;text-align:right;">Giá</th>
    <th style="padding:6px 3px;text-align:center;">SLN</th>
    <th style="padding:6px 3px;text-align:right;">Giá TK</th>
    <th style="padding:6px 3px;text-align:right;">Tồn đầu</th>
    <th style="padding:6px 3px;text-align:right;">Nhập</th>
    <th style="padding:6px 3px;text-align:right;">Xuất</th>
    <th style="padding:6px 3px;text-align:right;font-weight:700;">Tồn</th>
    <th style="padding:6px 3px;text-align:center;">CB</th>
    <th style="padding:6px 3px;text-align:center;">TT</th>
    <th style="padding:6px 3px;"></th></tr></thead><tbody>`;
    list.forEach(i=>{
        const s=getStockInfo(i);
        const hiddenStyle=i.hidden?'opacity:0.35;':'';const hiddenIcon=i.hidden?'👁️‍🗨️':'👁️';
        html+=`<tr style="border-bottom:1px solid rgba(255,255,255,0.03);${hiddenStyle}">
        <td style="padding:5px 3px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(i.name)}${i.hidden?' (ẨN)':''}">${esc(i.name)}${i.hidden?' <span style="font-size:0.6rem;color:var(--text-muted);">(ẨN)</span>':''}</td>
        <td style="padding:5px 3px;color:var(--text-muted);">${i.unit}</td>
        <td style="padding:5px 3px;text-align:right;color:var(--accent-warm);">${fmtP(i.unitPrice)}</td>
        <td style="padding:5px 3px;text-align:center;"><input type="number" value="${i.sln||1}" style="width:45px;text-align:center;font-size:0.72rem;padding:2px;" onchange="setSLN(${i.id},this.value)"></td>
        <td style="padding:5px 3px;text-align:right;color:var(--accent);font-weight:600;" title="${fmtP(i.unitPrice)} × ${i.sln||1} = ${fmtP(i.unitPrice*(i.sln||1))}">${fmtP(i.unitPrice*(i.sln||1))}</td>
        <td style="padding:5px 3px;text-align:right;"><input type="number" value="${i.openStock||0}" style="width:55px;text-align:right;font-size:0.72rem;padding:2px 3px;" onchange="setOpenStock(${i.id},this.value)"></td>
        <td style="padding:5px 3px;text-align:right;color:var(--accent-green);">${s.purchased||0}</td>
        <td style="padding:5px 3px;text-align:right;color:var(--accent-red);">${s.totalUsed||0}</td>
        <td style="padding:5px 3px;text-align:right;font-weight:700;color:${s.status==='danger'?'var(--accent-red)':s.status==='warning'?'#f59e0b':'var(--text-primary)'};">${s.stock}</td>
        <td style="padding:5px 3px;text-align:center;"><input type="number" value="${i.warnLevel||''}" placeholder="—" style="width:45px;text-align:center;font-size:0.7rem;padding:2px;" onchange="setWarnLevel(${i.id},this.value)"></td>
        <td style="padding:5px 3px;text-align:center;" title="${s.avgDaily>0?'TB '+s.avgDaily+'/ngày, còn ~'+s.daysLeft+' ngày':'Chưa có dữ liệu'}">${sI[s.status]}</td>
        <td style="padding:5px 3px;text-align:center;white-space:nowrap;">
            <button onclick="toggleHideIngredient(${i.id})" style="font-size:0.68rem;background:none;border:none;cursor:pointer;" title="${i.hidden?'Hiện lại':'Ẩn NL'}">${hiddenIcon}</button>
            <button onclick="editIngredient(${i.id})" style="font-size:0.68rem;background:none;border:none;cursor:pointer;">✏️</button>
            <button onclick="deleteIngredient(${i.id})" style="font-size:0.68rem;background:none;border:none;cursor:pointer;">🗑️</button></td></tr>`;
    });
    html+='</tbody></table>';
    document.getElementById('inventoryTable').innerHTML=html;
}
function setOpenStock(id,val){const i=state.ingredients.find(x=>x.id===id);if(i){i.openStock=parseFloat(val)||0;saveState();}}
function setWarnLevel(id,val){const i=state.ingredients.find(x=>x.id===id);if(i){i.warnLevel=parseFloat(val)||0;saveState();}}
function setSLN(id,val){const i=state.ingredients.find(x=>x.id===id);if(i){i.sln=parseFloat(val)||1;saveState();}}
function addIngredient(){const n=document.getElementById('newIngName').value.trim(),u=document.getElementById('newIngUnit').value.trim(),p=parseInt(document.getElementById('newIngPrice').value);
if(!n||!u||!p){toast('⚠️ Nhập đủ thông tin');return;}
state.ingredients.push({id:state.nextIngId++,name:n,unit:u,unitPrice:p,sln:1,openStock:0,warnLevel:0});
document.getElementById('newIngName').value='';document.getElementById('newIngUnit').value='';document.getElementById('newIngPrice').value='';
saveState();renderInventory();toast(`✅ Đã thêm "${n}"`);}
function editIngredient(id){const i=state.ingredients.find(x=>x.id===id);if(!i)return;
const body=`<div style="display:flex;flex-direction:column;gap:12px;">
<label style="font-size:0.78rem;color:var(--text-muted)">Tên NL</label><input type="text" id="editIngName" value="${esc(i.name)}">
<label style="font-size:0.78rem;color:var(--text-muted)">Đơn vị</label><input type="text" id="editIngUnit" value="${i.unit}">
<label style="font-size:0.78rem;color:var(--text-muted)">Đơn giá (đ/${i.unit})</label><input type="number" id="editIngPrice" value="${i.unitPrice}">
<label style="font-size:0.78rem;color:var(--text-muted)">SLN (số lượng/gói khi mua)</label><input type="number" id="editIngSLN" value="${i.sln||1}">
<div style="border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:4px;">
<label style="font-size:0.78rem;color:var(--accent-blue);font-weight:600;">📦 Nhà cung cấp</label>
<input type="text" id="editIngSupplier" value="${esc(i.supplier||'')}" placeholder="VD: Shopee - ABC Store, Chợ Thủ Đức, Metro...">
<label style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">🔗 Link mua hàng (tuỳ chọn)</label>
<input type="url" id="editIngSupplierLink" value="${esc(i.supplierLink||'')}" placeholder="https://shopee.vn/...">
</div>
<button class="btn btn-primary" onclick="saveEditIngredient(${i.id})">💾 Lưu</button></div>`;
openModal(`✏️ Sửa: ${i.name}`,body);}
function saveEditIngredient(id){const i=state.ingredients.find(x=>x.id===id);if(!i)return;
const n=document.getElementById('editIngName').value.trim(),u=document.getElementById('editIngUnit').value.trim(),p=parseInt(document.getElementById('editIngPrice').value),sln=parseInt(document.getElementById('editIngSLN')?.value)||1;
const supplier=document.getElementById('editIngSupplier')?.value.trim()||'';
const supplierLink=document.getElementById('editIngSupplierLink')?.value.trim()||'';
if(!n||!u||!p){toast('⚠️ Nhập đủ thông tin');return;}
i.name=n;i.unit=u;i.unitPrice=p;i.sln=sln;i.supplier=supplier;i.supplierLink=supplierLink;
saveState();renderInventory();renderRecipes();closeModal();toast(`✅ Đã cập nhật "${n}"`);}
function toggleHideIngredient(id){const i=state.ingredients.find(x=>x.id===id);if(!i)return;i.hidden=!i.hidden;saveState();renderInventory();toast(i.hidden?`👁️‍🗨️ Đã ẩn "${i.name}" khỏi danh sách cần mua`:`👁️ Đã hiện lại "${i.name}"`);}
function deleteIngredient(id){if(!confirm('Xóa NL này?'))return;state.ingredients=state.ingredients.filter(i=>i.id!==id);saveState();renderInventory();toast('🗑️ Đã xóa');}
function exportIngredientsJSON(){const data=state.ingredients.map(i=>({name:i.name,unit:i.unit,unitPrice:i.unitPrice,sln:i.sln||1,openStock:i.openStock||0,warnLevel:i.warnLevel||0,supplier:i.supplier||'',supplierLink:i.supplierLink||'',hidden:!!i.hidden}));
const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');
a.href=URL.createObjectURL(b);a.download=`monstea-kho-${today()}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);toast('📥 Đã xuất JSON!');}
function importIngredientsJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();
r.onload=(ev)=>{try{const data=JSON.parse(ev.target.result);if(!Array.isArray(data)){toast('❌ File không hợp lệ');return;}
let updated=0,added=0;data.forEach(d=>{if(!d.name)return;const existing=state.ingredients.find(i=>i.name===d.name);
if(existing){if(d.unitPrice)existing.unitPrice=d.unitPrice;if(d.unit)existing.unit=d.unit;if(d.sln)existing.sln=d.sln;if(d.openStock!==undefined)existing.openStock=d.openStock;if(d.warnLevel!==undefined)existing.warnLevel=d.warnLevel;updated++;}
else{state.ingredients.push({id:state.nextIngId++,name:d.name,unit:d.unit||'g',unitPrice:d.unitPrice||0,sln:d.sln||1,openStock:d.openStock||0,warnLevel:d.warnLevel||0});added++;}});
saveState();renderInventory();renderRecipes();toast(`✅ Cập nhật ${updated}, thêm ${added} NL`);
}catch(err){toast('❌ Lỗi: '+err.message);}};r.readAsText(f);e.target.value='';}

// ═══════════════════════════════════════
// CHI TIÊU
// ═══════════════════════════════════════
function getExpenseDate(){return expenseViewDate||today();}
function changeExpenseDate(dir){
    if(dir===0){expenseViewDate=null;}
    else{const d=new Date(getExpenseDate());d.setDate(d.getDate()+dir);expenseViewDate=d.toISOString().slice(0,10);}
    renderExpenseTab();
}
function renderExpenseTab(){
    const dt=getExpenseDate();
    document.getElementById('ctDateLabel').textContent=dt===today()?'(Hôm nay)':'('+dt+')';
    const purchases=(state.purchases||{})[dt]||[];
    document.getElementById('purchaseList').innerHTML=purchases.length?purchases.map(p=>`<div class="setting-item"><span class="si-name">${esc(p.name||'?')}</span><span style="font-size:0.72rem;color:var(--text-muted);">${p.qty}×${p.sln}=${p.totalQty} ${p.unit||''}</span><span class="si-price">${fmtP(p.totalCost)}</span><span style="font-size:0.72rem;color:var(--accent-warm);">${fmtP(p.unitPrice)}/${p.unit||''}</span><button onclick="deletePurchase('${dt}',${p.id})" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button></div>`).join(''):'<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
    document.getElementById('purchaseTotal').textContent=purchases.reduce((s,p)=>s+p.totalCost,0)?'Tổng nhập NL: '+fmtP(purchases.reduce((s,p)=>s+p.totalCost,0)):'';
    const expenses=(state.expenses||{})[dt]||[];
    document.getElementById('expenseList').innerHTML=expenses.length?expenses.map(e=>`<div class="setting-item"><span class="si-name">${esc(e.name)}</span><span class="si-price">${fmtP(e.amount)}</span><button onclick="deleteExpense('${dt}',${e.id})" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button></div>`).join(''):'<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
    document.getElementById('expenseTotal').textContent=expenses.reduce((s,e)=>s+e.amount,0)?'Tổng chi phí khác: '+fmtP(expenses.reduce((s,e)=>s+e.amount,0)):'';
    // Xuất kho thủ công — smart waste tracking
    const reasonIcons={used:'🔧',spoiled:'🗑️',loss:'📉',other:'📌'};
    const reasonLabels={used:'Sử dụng',spoiled:'Hư/Hết hạn',loss:'Hao hụt',other:'Khác'};
    const stockOuts=(state.manualUsage||{})[dt]||[];
    const soEl=document.getElementById('stockOutList');
    if(soEl){
        // Calculate today's recipe usage per ingredient
        const todayRecipeUsage=calcDailyUsage(dt);
        let wasteTotal=0;
        soEl.innerHTML=stockOuts.length?stockOuts.map(s=>{
            const recipeUsed=Math.round((todayRecipeUsage[s.ingId]||0)*100)/100;
            const waste=Math.max(0,Math.round((s.qty-recipeUsed)*100)/100);
            const ing=state.ingredients.find(i=>i.id===s.ingId);
            const wasteCost=Math.round(waste*(ing?ing.unitPrice:0));
            wasteTotal+=wasteCost;
            const pct=s.qty>0?Math.round(waste/s.qty*100):0;
            return `<div class="setting-item" style="flex-wrap:wrap;">
                <span class="si-name">${reasonIcons[s.reason]||'📤'} ${esc(s.name)}</span>
                <span style="font-size:0.72rem;color:var(--text-muted);">Xuất: ${s.qty} ${s.unit||''}</span>
                <span style="font-size:0.72rem;color:var(--accent-green);">Bán CT: ${recipeUsed} ${s.unit||''}</span>
                <span style="font-size:0.72rem;font-weight:700;color:${waste>0?'var(--accent-red)':'var(--accent-green)'};">
                    ${waste>0?`🗑️ Hao: ${waste} ${s.unit||''} (${pct}%) ≈ ${fmtP(wasteCost)}`:'✅ Hết sạch'}
                </span>
                <span style="font-size:0.68rem;color:var(--text-muted);">${s.time||''}</span>
                <button onclick="deleteStockOut('${dt}',${s.id})" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button>
            </div>`;
        }).join(''):'<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
        // Auto-sync waste to expenses
        if(wasteTotal>0){
            if(!state.expenses)state.expenses={};
            if(!state.expenses[dt])state.expenses[dt]=[];
            const existWaste=state.expenses[dt].find(e=>e.name==='🗑️ Hao hụt NL (tự động)');
            if(existWaste){
                if(existWaste.amount!==wasteTotal){existWaste.amount=wasteTotal;saveState();}
            }else{
                state.expenses[dt].push({id:state.nextExpenseId++,name:'🗑️ Hao hụt NL (tự động)',amount:wasteTotal,time:'auto',isAutoWaste:true});
                saveState();
            }
        }else{
            // Hết hao hụt → xóa entry tự động nếu có
            if(state.expenses&&state.expenses[dt]){
                const idx=state.expenses[dt].findIndex(e=>e.name==='🗑️ Hao hụt NL (tự động)');
                if(idx>=0){state.expenses[dt].splice(idx,1);saveState();}
            }
        }
    }
    const soTotal=document.getElementById('stockOutTotal');
    if(soTotal)soTotal.textContent=stockOuts.length?`Tổng xuất: ${stockOuts.length} mục`:'';
    renderNotes();
}
function filterPurchaseIng(){
    const q=(document.getElementById('purchaseIngSearch').value||'').toLowerCase();
    const dd=document.getElementById('purchaseIngDropdown');
    const list=state.ingredients.filter(i=>!q||i.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,15);
    if(!list.length||!q){dd.style.display='none';return;}
    dd.style.display='block';
    dd.innerHTML=list.map(i=>`<div style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid rgba(255,255,255,0.04);" onmousedown="selectPurchaseIng(${i.id})" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">${esc(i.name)} <span style="color:var(--text-muted);font-size:0.72rem;">(${i.unit}, SLN:${i.sln||1})</span></div>`).join('');
}
function selectPurchaseIng(id){
    const ing=state.ingredients.find(i=>i.id===id);if(!ing)return;
    document.getElementById('purchaseIngSearch').value=ing.name;
    document.getElementById('purchaseIngId').value=id;
    document.getElementById('purchaseSLN').value=ing.sln||1;
    document.getElementById('purchaseIngDropdown').style.display='none';
    calcPurchasePreview();
    document.getElementById('purchaseSL').focus();
}
document.addEventListener('click',e=>{const dd=document.getElementById('purchaseIngDropdown');if(dd&&!e.target.closest('#purchaseIngSearch')&&!e.target.closest('#purchaseIngDropdown'))dd.style.display='none';});
function calcPurchasePreview(){
    const sln=parseFloat(document.getElementById('purchaseSLN').value)||0;
    const sl=parseFloat(document.getElementById('purchaseSL').value)||0;
    const cost=(parseFloat(document.getElementById('purchaseCost').value)||0)*1000;
    const el=document.getElementById('purchasePreview');
    if(sln&&sl&&cost){const tq=sl*sln,up=Math.round(cost/tq);el.style.display='block';
    el.innerHTML=`→ Tổng: <b>${tq}</b> | Đơn giá: <b style="color:var(--accent)">${fmtP(up)}</b> | Thành tiền: <b>${fmtP(cost)}</b>`;}
    else{el.style.display='none';}
}
function addPurchase(){
    const ingId=parseInt(document.getElementById('purchaseIngId').value);
    const ing=state.ingredients.find(i=>i.id===ingId);if(!ing){toast('⚠️ Chọn nguyên liệu từ danh sách');return;}
    const sln=parseFloat(document.getElementById('purchaseSLN').value)||0;
    const sl=parseFloat(document.getElementById('purchaseSL').value)||0;
    const cost=(parseFloat(document.getElementById('purchaseCost').value)||0)*1000;
    if(!sln||!sl||!cost){toast('⚠️ Nhập đủ SLN, SL, Tổng tiền');return;}
    const totalQty=sl*sln,unitPrice=Math.round(cost/totalQty);
    const dt=getExpenseDate();if(!state.purchases)state.purchases={};if(!state.purchases[dt])state.purchases[dt]=[];
    state.purchases[dt].push({id:state.nextPurchaseId++,ingId,name:ing.name,unit:ing.unit,totalCost:cost,qty:sl,sln,totalQty,unitPrice,time:nowTime()});
    // Tính giá trung bình 3 lần nhập gần nhất cho nguyên liệu này
    const allPurchases=Object.entries(state.purchases)
        .sort((a,b)=>a[0]<b[0]?1:-1) // sort ngày mới nhất trước
        .flatMap(([,ps])=>ps)
        .filter(p=>p.ingId===ingId && p.unitPrice>0);
    const last3=allPurchases.slice(0,3);
    const avgPrice=last3.length>0?Math.round(last3.reduce((s,p)=>s+p.unitPrice,0)/last3.length):unitPrice;
    ing.unitPrice=avgPrice;ing.sln=sln;
    document.getElementById('purchaseIngSearch').value='';document.getElementById('purchaseIngId').value='';
    document.getElementById('purchaseSLN').value='';document.getElementById('purchaseSL').value='';document.getElementById('purchaseCost').value='';
    document.getElementById('purchasePreview').style.display='none';
    const noteAvg=last3.length>1?` (TB ${last3.length} lần: ${fmtP(avgPrice)}/${ing.unit})`:'';
    saveState();renderExpenseTab();toast(`✅ Nhập ${ing.name}: ${fmtP(unitPrice)}/${ing.unit}${noteAvg}`);
}
function deletePurchase(dt,id){if(!confirm('Xóa?'))return;state.purchases[dt]=(state.purchases[dt]||[]).filter(p=>p.id!==id);saveState();renderExpenseTab();}
function addExpense(){
    const name=document.getElementById('expenseName').value.trim();
    const amount=(parseFloat(document.getElementById('expenseAmount').value)||0)*1000;
    if(!name||!amount){toast('⚠️ Nhập tên và số tiền');return;}
    const dt=getExpenseDate();if(!state.expenses)state.expenses={};if(!state.expenses[dt])state.expenses[dt]=[];
    state.expenses[dt].push({id:state.nextExpenseId++,name,amount,time:nowTime()});
    document.getElementById('expenseName').value='';document.getElementById('expenseAmount').value='';
    saveState();renderExpenseTab();toast(`✅ ${name}: ${fmtP(amount)}`);
}
function deleteExpense(dt,id){if(!confirm('Xóa?'))return;state.expenses[dt]=(state.expenses[dt]||[]).filter(e=>e.id!==id);saveState();renderExpenseTab();}

// ═══════════════════════════════════════
// XUẤT KHO THỦ CÔNG
// ═══════════════════════════════════════
function filterStockOutIng(){
    const q=(document.getElementById('stockOutIngSearch').value||'').toLowerCase();
    const dd=document.getElementById('stockOutIngDropdown');
    const list=state.ingredients.filter(i=>!q||i.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,15);
    if(!list.length||!q){dd.style.display='none';return;}
    dd.style.display='block';
    dd.innerHTML=list.map(i=>`<div style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid rgba(255,255,255,0.04);" onmousedown="selectStockOutIng(${i.id})" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">${esc(i.name)} <span style="color:var(--text-muted);font-size:0.72rem;">(${i.unit})</span></div>`).join('');
}
function selectStockOutIng(id){
    const ing=state.ingredients.find(i=>i.id===id);if(!ing)return;
    document.getElementById('stockOutIngSearch').value=ing.name;
    document.getElementById('stockOutIngId').value=id;
    document.getElementById('stockOutIngDropdown').style.display='none';
    document.getElementById('stockOutQty').focus();
}
document.addEventListener('click',e=>{const dd=document.getElementById('stockOutIngDropdown');if(dd&&!e.target.closest('#stockOutIngSearch')&&!e.target.closest('#stockOutIngDropdown'))dd.style.display='none';});

function addStockOut(){
    const ingId=parseInt(document.getElementById('stockOutIngId').value);
    const ing=state.ingredients.find(i=>i.id===ingId);
    if(!ing){toast('⚠️ Chọn nguyên liệu');return;}
    const qty=parseFloat(document.getElementById('stockOutQty').value)||0;
    if(!qty){toast('⚠️ Nhập số lượng');return;}
    const reason=document.getElementById('stockOutReason').value;
    const reasonLabels={used:'Sử dụng',spoiled:'Hư/Hết hạn',loss:'Hao hụt',other:'Khác'};
    const dt=getExpenseDate();
    if(!state.manualUsage)state.manualUsage={};
    if(!state.manualUsage[dt])state.manualUsage[dt]=[];
    if(!state.nextStockOutId)state.nextStockOutId=1;
    state.manualUsage[dt].push({
        id:state.nextStockOutId++, ingId, name:ing.name, unit:ing.unit,
        qty, reason, time:nowTime()
    });
    document.getElementById('stockOutIngSearch').value='';
    document.getElementById('stockOutIngId').value='';
    document.getElementById('stockOutQty').value='';
    saveState();renderExpenseTab();renderInventory();
    toast(`📤 Xuất ${qty} ${ing.unit} ${ing.name} — ${reasonLabels[reason]}`);
}
function deleteStockOut(dt,id){
    if(!confirm('Xóa mục xuất kho này?'))return;
    state.manualUsage[dt]=(state.manualUsage[dt]||[]).filter(s=>s.id!==id);
    saveState();renderExpenseTab();renderInventory();
}

// ═══════════════════════════════════════
// NOTES (Ghi chú)
// ═══════════════════════════════════════
function cleanOldNotes(){
    if(!state.dailyNotes)state.dailyNotes=[];
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-7);
    const cutStr=cutoff.toISOString().slice(0,10);
    state.dailyNotes=state.dailyNotes.filter(n=>!n.done||n.doneDate>cutStr);
}
function addNote(){
    const text=document.getElementById('noteText').value.trim();
    if(!text){toast('⚠️ Nhập ghi chú');return;}
    if(!state.dailyNotes)state.dailyNotes=[];
    if(!state.nextNoteId)state.nextNoteId=1;
    state.dailyNotes.push({id:state.nextNoteId++,text,date:today(),time:nowTime(),done:false,doneDate:null});
    document.getElementById('noteText').value='';
    saveState();renderNotes();
}
function toggleNote(id){
    if(!state.dailyNotes)return;
    const n=state.dailyNotes.find(x=>x.id===id);if(!n)return;
    if(!n.done){n.done=true;n.doneDate=today();}
    else{n.done=false;n.doneDate=null;}
    saveState();renderNotes();
}
function renderNotes(){
    cleanOldNotes();
    const el=document.getElementById('notesList');if(!el)return;
    const notes=(state.dailyNotes||[]).slice().reverse();
    if(!notes.length){el.innerHTML='<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có ghi chú</div>';return;}
    let lastDate='',html='';
    notes.forEach(n=>{
        if(n.date!==lastDate){lastDate=n.date;
        const label=n.date===today()?'Hôm nay':n.date;
        html+=`<div style="font-size:0.7rem;color:var(--text-muted);padding:6px 0 2px;border-top:1px solid rgba(255,255,255,0.04);margin-top:4px;">${label}</div>`;}
        html+=`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;${n.done?'opacity:0.45;':''}">
        <span style="flex:1;font-size:0.82rem;${n.done?'text-decoration:line-through;color:var(--text-muted);':''}">${esc(n.text)}</span>
        <span style="font-size:0.68rem;color:var(--text-muted);white-space:nowrap;">${n.time}</span>
        <button onclick="toggleNote(${n.id})" style="font-size:0.7rem;background:none;border:none;cursor:pointer;" title="${n.done?'Hoàn tác':'Xong'}">${n.done?'↩️':'✔️'}</button>
        </div>`;
    });
    el.innerHTML=html;
}

// ═══════════════════════════════════════
// ATTENDANCE HISTORY (#8)
// ═══════════════════════════════════════
let attViewMode='month';
function setAttView(mode,val){
    attViewMode=mode;
    if(mode==='custom'&&val)document.getElementById('attMonthPick').value=val;
    renderAttHistory();
}
function getAttDates(mode){
    const td=new Date();
    if(mode==='week'){const dates=[];for(let i=6;i>=0;i--){const d=new Date(td);d.setDate(d.getDate()-i);dates.push(d.toISOString().slice(0,10));}return dates;}
    if(mode==='month'||mode==='custom'){
        let y=td.getFullYear(),m=td.getMonth();
        const pick=document.getElementById('attMonthPick')?.value;
        if(mode==='custom'&&pick){const [py,pm]=pick.split('-');y=parseInt(py);m=parseInt(pm)-1;}
        const days=new Date(y,m+1,0).getDate();const dates=[];
        for(let d=1;d<=days;d++){const dt=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;dates.push(dt);}
        return dates;
    }
    return [today()];
}
function renderAttHistory(){
    const el=document.getElementById('attHistoryBody');
    const sal=document.getElementById('attSalaryCard');
    if(!el)return;
    const dates=getAttDates(attViewMode);
    const OT_START=22*60,OT_MULT=1.3;
    const staffTotals={};
    state.staff.forEach(s=>staffTotals[s.id]={name:s.name,totalH:0,normalH:0,otH:0,days:0,totalWage:0,wageRate:s.wageRate||25000});
    let html=`<table style="width:100%;border-collapse:collapse;font-size:0.72rem;">
    <thead><tr style="border-bottom:2px solid var(--border-subtle);">
    <th style="padding:4px;text-align:left;">Ngày</th>`;
    state.staff.forEach(s=>html+=`<th style="padding:4px;text-align:center;">${esc(s.name)}</th>`);
    html+=`</tr></thead><tbody>`;
    dates.forEach(dt=>{
        const recs=(state.attendance||{})[dt]||[];
        html+=`<tr style="border-bottom:1px solid rgba(255,255,255,0.03);${dt===today()?'background:rgba(232,166,53,0.06);':''}">`;
        const label=dt===today()?'Hôm nay':dt.slice(5);
        html+=`<td style="padding:4px;color:var(--text-muted);white-space:nowrap;">${label}</td>`;
        state.staff.forEach(s=>{
            const r=recs.find(x=>x.staffId===s.id);
            if(r&&r.hours){
                const [iH,iM]=(r.checkIn||'0:0').split(':').map(Number);
                const [oH,oM]=(r.checkOut||'0:0').split(':').map(Number);
                const inMin=iH*60+iM,outMin=oH*60+oM;
                let normH=r.hours,otHr=0;
                if(outMin>OT_START){normH=Math.max(0,(Math.min(outMin,OT_START)-inMin)/60);otHr=Math.max(0,(outMin-Math.max(inMin,OT_START))/60);}
                const dayRate=r.wageRate||staffTotals[s.id].wageRate;
                staffTotals[s.id].totalH+=r.hours;staffTotals[s.id].normalH+=normH;staffTotals[s.id].otH+=otHr;staffTotals[s.id].days++;
                staffTotals[s.id].totalWage+=Math.round(normH*dayRate+otHr*dayRate*OT_MULT);
                html+=`<td style="padding:4px;text-align:center;color:var(--accent-green);"><div>${r.hours}h</div><div style="font-size:0.6rem;color:var(--text-muted);margin-top:1px;">${r.checkIn||'?'}→${r.checkOut||'?'}</div></td>`;
            }else html+=`<td style="padding:4px;text-align:center;color:var(--text-muted);">—</td>`;
        });
        html+=`</tr>`;
    });
    html+=`</tbody></table>`;
    el.innerHTML=html;
    // Salary summary
    sal.innerHTML=`<div style="font-weight:700;font-size:0.82rem;margin-bottom:8px;">💰 Tính lương</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
    <thead><tr style="border-bottom:2px solid var(--border-subtle);">
    <th style="padding:4px;text-align:left;">NV</th><th>Ngày</th><th>Tổng giờ</th><th>Thường</th><th>OT</th><th style="text-align:right;">Lương</th></tr></thead><tbody>
    ${state.staff.map(s=>{const t=staffTotals[s.id];const salary=t.totalWage;
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
    <td style="padding:4px;font-weight:600;">${esc(t.name)}</td>
    <td style="padding:4px;text-align:center;">${t.days}</td>
    <td style="padding:4px;text-align:center;">${Math.round(t.totalH*10)/10}h</td>
    <td style="padding:4px;text-align:center;">${Math.round(t.normalH*10)/10}h</td>
    <td style="padding:4px;text-align:center;color:${t.otH?'var(--accent-warm)':'var(--text-muted)'};">${Math.round(t.otH*10)/10}h</td>
    <td style="padding:4px;text-align:right;font-weight:700;color:var(--accent);">${fmtP(salary)}</td></tr>`;}).join('')}
    <tr style="border-top:2px solid var(--border-subtle);"><td colspan="5" style="padding:4px;font-weight:700;">TỔNG</td>
    <td style="padding:4px;text-align:right;font-weight:800;color:var(--accent);font-size:0.88rem;">${fmtP(state.staff.reduce((s,st)=>{const t=staffTotals[st.id];return s+t.totalWage;},0))}</td></tr>
    </tbody></table>`;
}

// ═══════════════════════════════════════
// MONTHLY REPORT (#10)
// ═══════════════════════════════════════
function renderMonthlyReport(){
    const sec=document.getElementById('monthlyReportSection');
    if(!sec)return;
    if(dashFilter!=='month'){sec.style.display='none';return;}
    sec.style.display='block';
    const now=new Date(),y=now.getFullYear(),m=now.getMonth();
    const daysInMonth=new Date(y,m+1,0).getDate();
    const firstDay=new Date(y,m,1).getDay(); // 0=Sun
    const OT_START=22*60,OT_MULT=1.3;
    // Collect daily data
    const dailyData=[];let totalRev=0,totalNL=0,totalNV=0,totalOther=0,totalInv=0;
    const monthItems={};
    // Previous month for comparison
    const pmDays=new Date(y,m,0).getDate();let pmRev=0,pmProfit=0;
    for(let d=1;d<=pmDays;d++){
        const dt=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const h=state.history[dt];if(h){pmRev+=h.totalRevenue||0;}
    }
    for(let d=1;d<=daysInMonth;d++){
        const dt=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const h=state.history[dt];
        let rev=0,inv=0,nlc=0,nvc=0,oexp=0;
        if(h){
            rev=h.totalRevenue||0;inv=h.invoices||0;
            // NL cost from recipes
            Object.entries(h.itemsSold||{}).forEach(([name,x])=>{
                if(!monthItems[name])monthItems[name]={qty:0,revenue:0};
                monthItems[name].qty+=x.qty;monthItems[name].revenue+=x.revenue;
                const mi=state.menu.find(m2=>m2.name===name);
                if(mi){const recipe=state.recipes[mi.id]||[];recipe.forEach(r=>{const ing=state.ingredients.find(i=>i.id===r.ingId);if(ing)nlc+=ing.unitPrice*r.qty*x.qty;});}
            });
            // Labor cost
            const recs=(state.attendance||{})[dt]||[];
            recs.forEach(r=>{if(!r.hours)return;const rRate=r.wageRate||25000;const[iH,iM]=(r.checkIn||'0:0').split(':').map(Number);const outMin=(parseInt((r.checkOut||'0:0').split(':')[0]))*60+parseInt((r.checkOut||'0:0').split(':')[1]);const inMin=iH*60+iM;if(outMin<=OT_START)nvc+=r.hours*rRate;else if(inMin>=OT_START)nvc+=r.hours*rRate*OT_MULT;else{nvc+=((OT_START-inMin)/60)*rRate+((outMin-OT_START)/60)*rRate*OT_MULT;}});
        }
        // Other expenses
        ((state.expenses||{})[dt]||[]).forEach(e=>oexp+=e.amount);
        const grossProfit=rev-nlc-nvc;
        const netProfit=grossProfit-oexp;
        totalRev+=rev;totalNL+=nlc;totalNV+=nvc;totalOther+=oexp;totalInv+=inv;
        dailyData.push({day:d,dt,rev,inv,nlc,nvc,oexp,grossProfit,netProfit,isPast:dt<=today()});
    }
    const totalGross=totalRev-totalNL-totalNV;
    const totalNet=totalGross-totalOther;
    // Calendar heatmap
    const dayNames=['CN','T2','T3','T4','T5','T6','T7'];
    let cal=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;font-size:0.7rem;">`;
    dayNames.forEach(d=>cal+=`<div style="color:var(--text-muted);font-weight:600;padding:4px;">${d}</div>`);
    for(let i=0;i<firstDay;i++)cal+=`<div></div>`;
    dailyData.forEach(d=>{
        let bg='rgba(255,255,255,0.03)',color='var(--text-muted)',glow='';
        if(d.isPast&&d.rev>0){
            const gp=d.grossProfit/1000;
            if(gp>=1000){bg='rgba(74,222,128,0.35)';color='#4ade80';glow='box-shadow:0 0 8px rgba(74,222,128,0.4),inset 0 0 6px rgba(74,222,128,0.15);';}
            else if(gp>=500){bg='rgba(74,222,128,0.2)';color='#4ade80';}
            else if(gp>0){bg='rgba(74,222,128,0.08)';color='rgba(74,222,128,0.7)';}
            else{bg='rgba(255,107,107,0.15)';color='var(--accent-red)';}
        }
        const isToday=d.dt===today()?'border:2px solid var(--accent);':'';
        cal+=`<div style="padding:6px 2px;border-radius:6px;background:${bg};${isToday}${glow}cursor:default;" title="${d.dt}: DT ${fmtP(d.rev)}, Lãi gộp ${fmtP(d.grossProfit)}">
        <div style="font-weight:700;color:${color};">${d.day}</div>
        ${d.rev?`<div style="font-size:0.6rem;color:${color};opacity:0.8;">${Math.round(d.grossProfit/1000)}k</div>`:''}
        </div>`;
    });
    cal+=`</div>`;
    cal+=`<div style="display:flex;gap:12px;justify-content:center;margin-top:8px;font-size:0.65rem;color:var(--text-muted);">
    <span>⬜ Chưa bán</span><span style="color:rgba(74,222,128,0.7);">🟩 &lt;500k</span><span style="color:#4ade80;">🟩 500k-1tr</span><span style="color:#4ade80;text-shadow:0 0 4px rgba(74,222,128,0.5);">✨ &gt;1tr</span><span style="color:var(--accent-red);">🟥 Lỗ</span>
    </div>`;
    document.getElementById('monthlyCalendar').innerHTML=cal;
    // Summary
    const prevCmp=pmRev?Math.round((totalRev-pmRev)/pmRev*100):0;
    const cmpText=pmRev?`(${prevCmp>=0?'↑':'↓'}${Math.abs(prevCmp)}% vs tháng trước)`:'';
    const cmpColor=prevCmp>=0?'var(--accent-green)':'var(--accent-red)';
    document.getElementById('monthlySummary').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
    <div style="text-align:center;padding:8px;background:rgba(232,166,53,0.06);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">Doanh thu</div>
        <div style="font-weight:800;color:var(--accent);font-size:1rem;">${fmtP(totalRev)}</div>
        <div style="font-size:0.62rem;color:${cmpColor};">${cmpText}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(255,107,107,0.04);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">CP NL</div>
        <div style="font-weight:700;color:var(--accent-red);">${fmtP(totalNL)}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(96,165,250,0.04);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">CP NV</div>
        <div style="font-weight:700;color:var(--accent-blue);">${fmtP(totalNV)}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(251,191,36,0.04);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">CP khác</div>
        <div style="font-weight:700;color:#fbbf24;">${fmtP(totalOther)}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(74,222,128,0.06);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">Lãi gộp</div>
        <div style="font-weight:800;color:${totalGross>=0?'var(--accent-green)':'var(--accent-red)'};">${fmtP(totalGross)}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(192,132,252,0.06);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">💎 Lãi ròng</div>
        <div style="font-weight:800;color:${totalNet>=0?'var(--accent-green)':'var(--accent-red)'};">${fmtP(totalNet)}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">Hóa đơn</div>
        <div style="font-weight:700;color:var(--accent-blue);">${totalInv}</div></div>
    <div style="text-align:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;">
        <div style="font-size:0.68rem;color:var(--text-muted);">TB/ngày</div>
        <div style="font-weight:700;color:var(--accent-warm);">${fmtP(dailyData.filter(d=>d.rev>0).length?Math.round(totalRev/dailyData.filter(d=>d.rev>0).length):0)}</div></div>
    </div>`;
    // Top items
    const ti=Object.entries(monthItems).map(([n,x])=>({name:n,...x})).sort((a,b)=>b.qty-a.qty).slice(0,10);
    document.getElementById('monthlyTopItems').innerHTML=ti.length?`<div style="font-weight:700;font-size:0.82rem;margin-bottom:6px;">🏆 Top 10 món tháng này</div>
    ${ti.map((i,x)=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:0.78rem;">
    <span style="width:20px;color:${x<3?'var(--accent)':'var(--text-muted)'};font-weight:${x<3?700:400};">${x+1}</span>
    <span style="flex:1;">${x===0?'🏆 ':''}${esc(i.name)}</span>
    <span style="font-weight:600;">${i.qty}</span>
    <span style="color:var(--accent-warm);min-width:70px;text-align:right;">${fmtP(i.revenue)}</span></div>`).join('')}`:'';
}
function printMonthlyReport(){
    const sec=document.getElementById('monthlyReportSection');
    if(!sec)return;
    const w=window.open('','','width=800,height=600');
    w.document.write(`<html><head><title>Monstea - Báo cáo tháng</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;background:#1a1520;color:#f0ece4;}
    table{width:100%;border-collapse:collapse;}th,td{padding:6px;border:1px solid rgba(255,255,255,0.1);font-size:12px;}
    @media print{body{background:white;color:black;}}</style></head>
    <body><h2>📊 Monstea — Báo cáo tháng</h2>${sec.querySelector('.card').innerHTML}</body></html>`);
    w.document.close();w.print();
}

// ═══════════════════════════════════════
// SMART RESTOCK (#13)
// ═══════════════════════════════════════
function copyNeedToBuyList(){
    const items=state.ingredients.filter(i=>!i.hidden).map(i=>({...i,s:getStockInfo(i)})).filter(i=>i.s.status==='danger'||i.s.status==='warning');
    if(!items.length){toast('✅ Kho đầy đủ!');return;}
    const text=items.map(i=>{
        const emoji=i.s.status==='danger'?'🔴':'🟡';
        const daysText=i.s.daysLeft<999?`≈${i.s.daysLeft} ngày`:'';
        const targetDays=7;
        const need=Math.max(0,Math.ceil(i.s.avgDaily*targetDays-i.s.stock));
        const packs=i.sln>1?Math.ceil(need/i.sln):need;
        const packText=i.sln>1?` (${packs} gói×${i.sln})`:` ${need} ${i.unit}`;
        return `${emoji} ${i.name}: còn ${i.s.stock} ${i.unit} ${daysText}\n   → Nhập${packText}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(()=>toast('📋 Đã copy danh sách cần mua!')).catch(()=>toast('❌ Không copy được'));
}

// ═══════════════════════════════════════
// RECIPES
// ═══════════════════════════════════════
function renderRecipes(){
    const c=document.getElementById('recipesList');if(!c)return;
    // Render templates
    renderTemplates();

    c.innerHTML=state.menu.filter(m=>m.active).map(m=>{
        const recipe=state.recipes[m.id]||[];
        const cogs=recipe.reduce((s,r)=>{const ing=state.ingredients.find(i=>i.id===r.ingId);return s+(ing?ing.unitPrice*r.qty:0);},0);
        const pct=m.price>0?Math.round(cogs/m.price*100):0;
        const isFood=['Đồ chiên','Ăn vặt'].includes(m.category);
        const ideal=isFood?'35-40%':'25-30%';
        const badge=pct===0?'':pct<=(isFood?40:30)?'good':pct<=(isFood?50:40)?'warn':'bad';
        const ings=recipe.map(r=>{const ing=state.ingredients.find(i=>i.id===r.ingId);return ing?`${r.qty}${ing.unit} ${ing.name}`:'?';});

        return `<div class="recipe-item"><div class="recipe-header"><span class="rh-name">${esc(m.name)}</span>
        <span>${cogs>0?`<span style="font-size:0.8rem;color:var(--accent-warm)">COGS: ${fmtP(cogs)}</span> <span class="cogs-badge ${badge}">${pct}%</span> <span style="font-size:0.68rem;color:var(--text-muted)">Gợi ý: ${ideal}</span>`:'<span style="font-size:0.78rem;color:var(--text-muted)">Chưa có công thức</span>'}</span></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:rgba(232,166,53,0.05);border:1px solid rgba(232,166,53,0.12);border-radius:8px;">
          <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">💰 Giá bán:</span>
          <input type="number" id="price-${m.id}" value="${m.price}" style="flex:1;max-width:140px;padding:5px 10px;font-family:var(--font-display);font-weight:700;font-size:0.9rem;color:var(--accent);" oninput="previewPrice(${m.id})">
          <span id="price-preview-${m.id}" style="font-family:var(--font-display);font-size:0.85rem;font-weight:700;color:var(--accent-warm);min-width:70px;"></span>
          <button class="btn btn-primary btn-sm" onclick="saveMenuPrice(${m.id})" style="font-size:0.72rem;padding:5px 12px;">💾 Lưu giá</button>
        </div>
        ${ings.length?`<div class="recipe-ing">${ings.map(x=>`<span>${x}</span>`).join('')}</div>`:''}
        <div style="margin-top:8px;display:flex;gap:6px;"><button class="btn btn-secondary btn-sm" onclick="editRecipe(${m.id})" style="font-size:0.72rem;">✏️ Sửa công thức</button></div></div>`;
    }).join('');}

function renderTemplates(){
    const c=document.getElementById('templatesList');if(!c)return;
    const tpls=state.recipeTemplates||[];
    if(!tpls.length){c.innerHTML='<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.82rem;">Chưa có mẫu — Bấm "Tạo mẫu mới" để bắt đầu</div>';return;}
    c.innerHTML=tpls.map(t=>{
        const ings=t.items.map(r=>{const ing=state.ingredients.find(i=>i.id===r.ingId);return ing?`${r.qty}${ing.unit} ${ing.name}`:'?';});
        const cost=t.items.reduce((s,r)=>{const ing=state.ingredients.find(i=>i.id===r.ingId);return s+(ing?ing.unitPrice*r.qty:0);},0);
        return `<div class="recipe-item" style="border-left:3px solid var(--accent);"><div class="recipe-header"><span class="rh-name" style="color:var(--accent)">📋 ${esc(t.name)}</span><span style="font-size:0.8rem;color:var(--accent-warm)">Chi phí: ${fmtP(cost)}</span></div>
        ${ings.length?`<div class="recipe-ing">${ings.map(x=>`<span>${x}</span>`).join('')}</div>`:''}
        <div style="margin-top:8px;display:flex;gap:6px;"><button class="btn btn-secondary btn-sm" onclick="editTemplate(${t.id})" style="font-size:0.72rem;">✏️ Sửa</button><button class="btn btn-danger btn-sm" onclick="deleteTemplate(${t.id})" style="font-size:0.72rem;">🗑️ Xóa</button></div></div>`;
    }).join('');}

function createTemplate(){
    const name=prompt('Tên bộ công thức mẫu (VD: Trà sữa cơ bản, Trà trái cây cơ bản):');
    if(!name)return;
    const tpl={id:state.nextTplId++,name,items:[]};
    state.recipeTemplates.push(tpl);saveState();
    editTemplate(tpl.id);}

function editTemplate(tplId){
    const t=(state.recipeTemplates||[]).find(x=>x.id===tplId);if(!t)return;
    let body=`<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;">Mẫu: <strong>${esc(t.name)}</strong></p>`;
    body+=`<div id="tplEditList">${t.items.map((r,idx)=>{const ing=state.ingredients.find(i=>i.id===r.ingId);
    return `<div class="setting-item" id="te-${idx}"><span class="si-name">${ing?ing.name:'?'}</span><input type="number" value="${r.qty}" style="width:80px;" id="teQty-${idx}" data-ing="${r.ingId}"><span style="font-size:0.75rem;color:var(--text-muted)">${ing?ing.unit:''}</span><button class="btn btn-danger btn-sm" onclick="document.getElementById('te-${idx}').remove()" style="padding:4px 8px">✕</button></div>`;}).join('')}</div>`;
    body+=`<div class="add-form" style="margin-top:12px;"><select id="tplIngSelect" style="flex:2;">${state.ingredients.map(i=>`<option value="${i.id}">${i.name} (${i.unit} — ${fmtP(i.unitPrice)})</option>`).join('')}</select><input type="number" id="tplIngQty" placeholder="SL" style="flex:1;"><button class="btn btn-primary btn-sm" onclick="addTplRow()">➕</button></div>`;
    body+=`<div style="margin-top:16px;text-align:right;"><button class="btn btn-primary" onclick="saveTemplate(${tplId})">💾 Lưu mẫu</button></div>`;
    openModal(`📋 Mẫu: ${t.name}`,body);}

function addTplRow(){const sel=document.getElementById('tplIngSelect'),qty=document.getElementById('tplIngQty').value;
if(!qty||qty<=0){toast('⚠️ Nhập số lượng');return;}
const ing=state.ingredients.find(i=>i.id===parseInt(sel.value));if(!ing)return;
const list=document.getElementById('tplEditList'),idx=list.children.length;
list.insertAdjacentHTML('beforeend',`<div class="setting-item" id="te-${idx}"><span class="si-name">${ing.name}</span><input type="number" value="${qty}" style="width:80px;" id="teQty-${idx}" data-ing="${ing.id}"><span style="font-size:0.75rem;color:var(--text-muted)">${ing.unit}</span><button class="btn btn-danger btn-sm" onclick="document.getElementById('te-${idx}').remove()" style="padding:4px 8px">✕</button></div>`);
document.getElementById('tplIngQty').value='';}

function saveTemplate(tplId){const t=(state.recipeTemplates||[]).find(x=>x.id===tplId);if(!t)return;
const list=document.getElementById('tplEditList');t.items=[];
list.querySelectorAll('.setting-item').forEach(el=>{const qI=el.querySelector('input[type="number"]');const iA=qI.getAttribute('data-ing');
if(iA)t.items.push({ingId:parseInt(iA),qty:parseFloat(qI.value)});
else{const nm=el.querySelector('.si-name').textContent;const ig=state.ingredients.find(i=>i.name===nm);if(ig)t.items.push({ingId:ig.id,qty:parseFloat(qI.value)});}});
saveState();renderRecipes();closeModal();toast('✅ Đã lưu mẫu');}

function deleteTemplate(tplId){if(!confirm('Xóa mẫu này?'))return;state.recipeTemplates=state.recipeTemplates.filter(t=>t.id!==tplId);saveState();renderRecipes();toast('🗑️ Đã xóa mẫu');}

function applyTemplate(menuId){
    const sel=document.getElementById('tplApplySelect');if(!sel)return;
    const tpl=(state.recipeTemplates||[]).find(t=>t.id===parseInt(sel.value));if(!tpl){toast('⚠️ Chọn mẫu');return;}
    const list=document.getElementById('recipeEditList');
    tpl.items.forEach(r=>{
        const ing=state.ingredients.find(i=>i.id===r.ingId);if(!ing)return;
        const idx=list.children.length;
        list.innerHTML+=`<div class="setting-item" id="re-${idx}"><span class="si-name">${ing.name}</span><input type="number" value="${r.qty}" style="width:80px;" id="reQty-${idx}" data-ing="${ing.id}"><span style="font-size:0.75rem;color:var(--text-muted)">${ing.unit}</span><button class="btn btn-danger btn-sm" onclick="document.getElementById('re-${idx}').remove()" style="padding:4px 8px">✕</button></div>`;
    });
    toast(`✅ Đã áp dụng mẫu "${tpl.name}" — chỉnh thêm bớt rồi Lưu`);}

function editRecipe(menuId){
    const m=state.menu.find(x=>x.id===menuId);if(!m)return;
    const recipe=state.recipes[menuId]||[];
    const tpls=state.recipeTemplates||[];

    let body=`<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;">Công thức cho: <strong>${esc(m.name)}</strong></p>`;

    // Template apply section
    if(tpls.length>0){
        body+=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;padding:10px 14px;background:rgba(232,166,53,0.06);border:1px solid rgba(232,166,53,0.15);border-radius:var(--radius-sm);"><span style="font-size:0.78rem;color:var(--accent);white-space:nowrap;">📋 Áp dụng mẫu:</span><select id="tplApplySelect" style="flex:1;">${tpls.map(t=>`<option value="${t.id}">${t.name} (${t.items.length} NL)</option>`).join('')}</select><button class="btn btn-primary btn-sm" onclick="applyTemplate(${menuId})" style="white-space:nowrap;">Áp dụng</button></div>`;
    }

    body+=`<div id="recipeEditList">${recipe.map((r,idx)=>{const ing=state.ingredients.find(i=>i.id===r.ingId);
    return `<div class="setting-item" id="re-${idx}"><span class="si-name">${ing?ing.name:'?'}</span><input type="number" value="${r.qty}" style="width:80px;" id="reQty-${idx}" data-ing="${r.ingId}"><span style="font-size:0.75rem;color:var(--text-muted)">${ing?ing.unit:''}</span><button class="btn btn-danger btn-sm" onclick="document.getElementById('re-${idx}').remove()" style="padding:4px 8px">✕</button></div>`;}).join('')}</div>`;
    body+=`<div class="add-form" style="margin-top:12px;"><select id="recipeIngSelect" style="flex:2;">${state.ingredients.map(i=>`<option value="${i.id}">${i.name} (${i.unit} — ${fmtP(i.unitPrice)})</option>`).join('')}</select><input type="number" id="recipeIngQty" placeholder="SL" style="flex:1;"><button class="btn btn-primary btn-sm" onclick="addRecipeRow()">➕</button></div>`;
    body+=`<div style="margin-top:16px;text-align:right;"><button class="btn btn-primary" onclick="saveRecipe(${menuId})">💾 Lưu công thức</button></div>`;
    openModal(`📋 Công thức: ${m.name}`,body);
}

function addRecipeRow(){const sel=document.getElementById('recipeIngSelect'),qty=document.getElementById('recipeIngQty').value;
if(!qty||qty<=0){toast('⚠️ Nhập số lượng');return;}
const ing=state.ingredients.find(i=>i.id===parseInt(sel.value));if(!ing)return;
const list=document.getElementById('recipeEditList'),idx=list.children.length;
list.insertAdjacentHTML('beforeend',`<div class="setting-item" id="re-${idx}"><span class="si-name">${ing.name}</span><input type="number" value="${qty}" style="width:80px;" id="reQty-${idx}" data-ing="${ing.id}"><span style="font-size:0.75rem;color:var(--text-muted)">${ing.unit}</span><button class="btn btn-danger btn-sm" onclick="document.getElementById('re-${idx}').remove()" style="padding:4px 8px">✕</button></div>`);
document.getElementById('recipeIngQty').value='';}

function saveRecipe(menuId){const list=document.getElementById('recipeEditList');
const recipe=[];
list.querySelectorAll('.setting-item').forEach(el=>{const qtyInput=el.querySelector('input[type="number"]');
const ingIdAttr=qtyInput.getAttribute('data-ing');
if(ingIdAttr){recipe.push({ingId:parseInt(ingIdAttr),qty:parseFloat(qtyInput.value)});}
else{const name=el.querySelector('.si-name').textContent;const ing=state.ingredients.find(i=>i.name===name);
if(ing)recipe.push({ingId:ing.id,qty:parseFloat(qtyInput.value)});}});
state.recipes[menuId]=recipe;saveState();renderRecipes();closeModal();toast('✅ Đã lưu công thức');}

function saveMenuPrice(menuId){
    const m=state.menu.find(x=>x.id===menuId);if(!m)return;
    const val=parseInt(document.getElementById('price-'+menuId).value);
    if(!val||val<=0){toast('⚠️ Giá không hợp lệ');return;}
    m.price=val;saveState();renderPOSMenu();renderRecipes();
    toast(`✅ ${m.name} — Giá: ${fmtP(val)}`);}

function previewPrice(menuId){
    const val=parseInt(document.getElementById('price-'+menuId)?.value)||0;
    const el=document.getElementById('price-preview-'+menuId);
    if(el)el.textContent=val>0?fmtP(val):'';}


// ═══════════════════════════════════════
// EXPORT INGREDIENTS USED
// ═══════════════════════════════════════
function exportIngredientsUsed(){
    const d=getDashData();const usage={};
    Object.entries(d.itemsSold).forEach(([name,data])=>{
        const menuItem=state.menu.find(m=>m.name===name);
        if(!menuItem)return;
        const recipe=state.recipes[menuItem.id]||[];
        recipe.forEach(r=>{const ing=state.ingredients.find(i=>i.id===r.ingId);
        if(!ing)return;if(!usage[ing.name])usage[ing.name]={unit:ing.unit,qty:0,cost:0};
        usage[ing.name].qty+=r.qty*data.qty;usage[ing.name].cost+=r.qty*data.qty*ing.unitPrice;});
    });
    if(!Object.keys(usage).length){toast('⚠️ Chưa có công thức hoặc chưa có doanh số');return;}
    let csv='Nguyên liệu,Đơn vị,Số lượng dùng,Chi phí\n';
    let totalCost=0;
    Object.entries(usage).sort((a,b)=>b[1].cost-a[1].cost).forEach(([n,u])=>{csv+=`"${n}","${u.unit}",${Math.round(u.qty*100)/100},${Math.round(u.cost)}\n`;totalCost+=u.cost;});
    csv+=`\nTổng chi phí NL,,,"${Math.round(totalCost)}"\n`;
    navigator.clipboard.writeText(csv).then(()=>toast('📦 Đã copy NL đã dùng — Paste vào Google Sheet!'));
}

// ═══════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════
function startClock(){function u(){const n=new Date(),e=document.getElementById('liveClock'),d=document.getElementById('liveDate');if(e)e.textContent=n.toLocaleTimeString('vi-VN');if(d)d.textContent=n.toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}u();setInterval(u,1000);}
function getStaffStatus(id){const td=today();if(!state.attendance[td])return 'out';const r=state.attendance[td].find(x=>x.staffId===id);if(!r)return 'out';return r.checkOut?'done':'in';}
function getStaffRecord(id){const td=today();return state.attendance[td]?.find(x=>x.staffId===id)||null;}
function toggleAttendance(id){if(currentRole==='staff'&&currentStaffId!==id){toast('⚠️ Chỉ có thể chấm công cho mình');return;}
const td=today();if(!state.attendance[td])state.attendance[td]=[];const st=getStaffStatus(id),s=state.staff.find(x=>x.id===id);
if(st==='out'){state.attendance[td].push({staffId:id,name:s.name,checkIn:nowTime(),checkOut:null,hours:null,wageRate:s.wageRate||25000});toast(`✅ ${s.name} — Vào ca`);}
else if(st==='in'){const r=state.attendance[td].find(x=>x.staffId===id);r.checkOut=nowTime();const[iH,iM]=r.checkIn.split(':').map(Number),[oH,oM]=r.checkOut.split(':').map(Number);r.hours=Math.round(((oH*60+oM)-(iH*60+iM))/60*10)/10;toast(`✅ ${s.name} — Ra ca (${r.hours}h)`);}
else{toast(`ℹ️ ${s.name} đã ra ca`);return;}saveState();renderAttendance();}
function renderAttendance(){document.getElementById('staffGrid').innerHTML=state.staff.map(s=>{const st=getStaffStatus(s.id),r=getStaffRecord(s.id),txt={out:'Chưa vào ca',in:'🟢 Đang làm',done:'✅ Đã ra ca'}[st],t=r?`${r.checkIn}${r.checkOut?' → '+r.checkOut+` (${r.hours}h)`:' → ...'}` :'';
const isLocked=currentRole==='staff'&&currentStaffId!==s.id;
return `<div class="staff-card status-${st}${isLocked?' locked':''}" onclick="toggleAttendance(${s.id})"><div class="sc-name">${esc(s.name)}</div><div class="sc-status">${txt}</div>${t?`<div class="sc-time">${t}</div>`:''}</div>`;}).join('');
const td=today(),recs=state.attendance[td]||[];
const isOwner=currentRole==='owner';
document.getElementById('attBody').innerHTML=recs.length?recs.map((r,idx)=>`<tr><td style="font-weight:600">${esc(r.name)}</td><td>${r.checkIn}</td><td>${r.checkOut||'—'}</td><td style="color:${r.hours?'var(--accent-green)':'var(--text-muted)'}">${r.hours?r.hours+'h':'—'}</td>${isOwner?`<td style="text-align:center"><button onclick="editAttendance(${idx})" style="background:none;border:none;cursor:pointer;font-size:0.72rem;" title="Sửa giờ">✏️</button></td>`:''}</tr>`).join(''):'<tr><td colspan="'+(isOwner?5:4)+'" style="text-align:center;color:var(--text-muted);padding:16px">Chưa có</td></tr>';
// Update table header for owner
const thead=document.querySelector('#tab-attendance .att-table thead tr');
if(thead&&isOwner&&!thead.querySelector('.att-edit-th')){const th=document.createElement('th');th.className='att-edit-th';th.textContent='';thead.appendChild(th);}
}
function editAttendance(idx){
    const td=today(),recs=state.attendance[td];if(!recs||!recs[idx])return;
    const r=recs[idx];
    const body=`<div style="display:flex;flex-direction:column;gap:12px;">
    <div><label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">👤 ${esc(r.name)}</label></div>
    <div><label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Vào ca</label>
    <input type="time" id="editAttIn" value="${r.checkIn||''}" style="width:100%;padding:8px;"></div>
    <div><label style="font-size:0.78rem;color:var(--text-muted);display:block;margin-bottom:4px;">Ra ca</label>
    <input type="time" id="editAttOut" value="${r.checkOut||''}" style="width:100%;padding:8px;"></div>
    <button class="btn btn-primary" onclick="saveEditAttendance(${idx})">💾 Lưu</button></div>`;
    openModal('✏️ Sửa giờ chấm công',body);
}
function saveEditAttendance(idx){
    const td=today(),r=state.attendance[td][idx];if(!r)return;
    const newIn=document.getElementById('editAttIn').value;
    const newOut=document.getElementById('editAttOut').value;
    if(!newIn){toast('⚠️ Phải có giờ vào ca');return;}
    r.checkIn=newIn;
    if(newOut){r.checkOut=newOut;const[iH,iM]=newIn.split(':').map(Number),[oH,oM]=newOut.split(':').map(Number);r.hours=Math.round(((oH*60+oM)-(iH*60+iM))/60*10)/10;}
    else{r.checkOut=null;r.hours=null;}
    saveState();renderAttendance();closeModal();toast(`✅ Đã cập nhật giờ ${r.name}`);
}

// ═══════════════════════════════════════
// CHECKLIST
// ═══════════════════════════════════════
function toggleChecklist(t,id){const l=t==='open'?state.openChecklist:state.closeChecklist;const i=l.find(c=>c.id===id);if(i)i.checked=!i.checked;saveState();renderChecklist();}
function renderChecklist(){['open','close'].forEach(t=>{const l=t==='open'?state.openChecklist:state.closeChecklist,c=document.getElementById(t+'Checklist'),p=document.getElementById(t+'Progress');
const tot=l.length,done=l.filter(c=>c.checked).length;p.style.width=tot?(done/tot*100)+'%':'0%';
c.innerHTML=l.map(c=>`<div class="cl-item ${c.checked?'checked':''}" onclick="toggleChecklist('${t}',${c.id})"><input type="checkbox" ${c.checked?'checked':''} onclick="event.stopPropagation();toggleChecklist('${t}',${c.id})"><span class="cl-text">${esc(c.text)}</span></div>`).join('')||'<div style="text-align:center;padding:20px;color:var(--text-muted)">Chưa có</div>';});}

// ═══════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════
function renderSettings(){
    document.getElementById('menuList').innerHTML=state.menu.map(m=>`<div class="setting-item" style="${m.active?'':'opacity:0.4'}">
<select onchange="changeMenuCat(${m.id},this.value)" style="width:auto;min-width:80px;padding:4px 8px;font-size:0.72rem;flex:0;">${state.categories.map(c=>`<option value="${c}" ${c===m.category?'selected':''}>${c}</option>`).join('')}</select>
<span class="si-name">${m.isGuide?'📖 ':''}${esc(m.name)}</span><span class="si-price">${m.isGuide?'(HD)':fmtP(m.price)}</span>
<div class="si-actions"><button onclick="editMenuItem(${m.id})" title="Sửa món">✏️</button><button onclick="toggleMenuItem(${m.id})" title="${m.active?'Ẩn':'Hiện'}">${m.active?'👁️':'🚫'}</button><button onclick="deleteMenuItem(${m.id})" title="Xóa">🗑️</button></div></div>`).join('');
    document.getElementById('newMenuCat').innerHTML=state.categories.map(c=>`<option value="${c}">${c}</option>`).join('');
    document.getElementById('staffList').innerHTML=state.staff.map(s=>`<div class="setting-item"><span class="si-name">${esc(s.name)}</span><span style="font-size:0.7rem;color:var(--accent);margin-left:auto;margin-right:8px;">💰${fmtP(s.wageRate||25000)}/h</span><span style="font-size:0.65rem;color:var(--text-muted);margin-right:8px;">🔑****</span><div class="si-actions"><button onclick="editStaff(${s.id})" title="Sửa">✏️</button><button onclick="deleteStaff(${s.id})">🗑️</button></div></div>`).join('');
    ['open','close'].forEach(t=>{const l=t==='open'?state.openChecklist:state.closeChecklist;
    document.getElementById(t+'ClSettings').innerHTML=l.map(c=>`<div class="setting-item"><span class="si-name">${esc(c.text)}</span><div class="si-actions"><button onclick="deleteChecklistItem('${t}',${c.id})">🗑️</button></div></div>`).join('');});
}

function changeMenuCat(id,cat){const m=state.menu.find(x=>x.id===id);if(!m)return;m.category=cat;saveState();renderPOSMenu();toast(`✅ ${m.name} → ${cat}`);}

function editMenuItem(id){const m=state.menu.find(x=>x.id===id);if(!m)return;
const body=`<div style="display:flex;flex-direction:column;gap:12px;">
<label style="font-size:0.78rem;color:var(--text-muted)">Tên món</label>
<input type="text" id="editMiName" value="${esc(m.name)}">
<label style="font-size:0.78rem;color:var(--text-muted)">Giá bán (đ)</label>
<input type="number" id="editMiPrice" value="${m.price}">
<label style="font-size:0.78rem;color:var(--text-muted)">Danh mục</label>
<select id="editMiCat">${state.categories.map(c=>`<option value="${c}" ${c===m.category?'selected':''}>${c}</option>`).join('')}</select>
<button class="btn btn-primary" onclick="saveEditMenuItem(${m.id})">💾 Lưu</button>
</div>`;
openModal(`✏️ Sửa: ${m.name}`,body);}

function saveEditMenuItem(id){const m=state.menu.find(x=>x.id===id);if(!m)return;
const n=document.getElementById('editMiName').value.trim(),p=parseInt(document.getElementById('editMiPrice').value),c=document.getElementById('editMiCat').value;
if(!n||!p){toast('⚠️ Nhập đủ thông tin');return;}
m.name=n;m.price=p;m.category=c;saveState();renderSettings();renderPOSMenu();renderRecipes();closeModal();toast(`✅ Đã cập nhật "${n}"`);}

function addMenuItem(){const n=document.getElementById('newMenuName').value.trim(),p=parseInt(document.getElementById('newMenuPrice').value),c=document.getElementById('newMenuCat').value;if(!n||!p){toast('⚠️ Nhập tên và giá');return;}state.menu.push({id:state.nextMenuId++,name:n,price:p,category:c,active:true});document.getElementById('newMenuName').value='';document.getElementById('newMenuPrice').value='';saveState();renderSettings();renderPOSMenu();toast(`✅ Đã thêm "${n}"`);}
function addCategory(){const n=document.getElementById('newCatName').value.trim();if(!n)return;if(state.categories.includes(n)){toast('⚠️ Đã tồn tại');return;}state.categories.push(n);document.getElementById('newCatName').value='';saveState();renderSettings();renderPOSMenu();toast(`✅ Đã thêm "${n}"`);}
function toggleMenuItem(id){const m=state.menu.find(x=>x.id===id);if(m)m.active=!m.active;saveState();renderSettings();renderPOSMenu();}
function deleteMenuItem(id){if(!confirm('Xóa món này khỏi menu?'))return;state.menu=state.menu.filter(m=>m.id!==id);saveState();renderSettings();renderPOSMenu();toast('🗑️ Đã xóa');}
function addStaff(){const n=document.getElementById('newStaffName').value.trim();if(!n)return;const pwd=String(state.nextStaffId)+'000';state.staff.push({id:state.nextStaffId++,name:n,password:pwd,wageRate:25000});document.getElementById('newStaffName').value='';saveState();renderSettings();renderAttendance();toast(`✅ Đã thêm "${n}" (pass: ${pwd})`);}
function editStaff(id){const s=state.staff.find(x=>x.id===id);if(!s)return;
const body=`<div style="display:flex;flex-direction:column;gap:12px;">
<label style="font-size:0.78rem;color:var(--text-muted)">Tên</label>
<input type="text" id="editStaffName" value="${esc(s.name)}">
<label style="font-size:0.78rem;color:var(--text-muted)">Mật khẩu</label>
<input type="text" id="editStaffPwd" value="${esc(s.password||'')}">
<label style="font-size:0.78rem;color:var(--text-muted)">Lương/giờ (đ)</label>
<input type="number" id="editStaffWage" value="${s.wageRate||25000}">
<button class="btn btn-primary" onclick="saveEditStaff(${s.id})">💾 Lưu</button>
</div>`;openModal(`✏️ Sửa NV: ${s.name}`,body);}
function saveEditStaff(id){const s=state.staff.find(x=>x.id===id);if(!s)return;
const n=document.getElementById('editStaffName').value.trim();
const p=document.getElementById('editStaffPwd').value.trim();
const w=parseInt(document.getElementById('editStaffWage').value)||25000;
if(!n||!p){toast('⚠️ Nhập đủ thông tin');return;}
// Check duplicate password
const dup=state.staff.find(x=>x.id!==id&&x.password===p);
if(dup){toast(`⚠️ Pass "${p}" đã dùng cho ${dup.name}`);return;}
if(APP_PASSWORDS[p]){toast('⚠️ Pass trùng với chủ quán');return;}
s.name=n;s.password=p;s.wageRate=w;saveState();renderSettings();renderAttendance();closeModal();toast(`✅ Đã cập nhật ${n}`);}
function deleteStaff(id){state.staff=state.staff.filter(s=>s.id!==id);saveState();renderSettings();renderAttendance();toast('🗑️ Đã xóa');}
function addChecklistItem(t){const iid=t==='open'?'newOpenCl':'newCloseCl';const txt=document.getElementById(iid).value.trim();if(!txt)return;(t==='open'?state.openChecklist:state.closeChecklist).push({id:state.nextClId++,text:txt,checked:false});document.getElementById(iid).value='';saveState();renderSettings();renderChecklist();toast('✅ Đã thêm');}
function deleteChecklistItem(t,id){if(t==='open')state.openChecklist=state.openChecklist.filter(c=>c.id!==id);else state.closeChecklist=state.closeChecklist.filter(c=>c.id!==id);saveState();renderSettings();renderChecklist();}

// ═══════════════════════════════════════
// GRAB ORDERS
// ═══════════════════════════════════════
const GRAB_FEE_RATE = 0.48;

function renderGrabSection(){
if(!state.grabOrders)state.grabOrders=[];
renderGrabMenuPicker();
renderGrabList();
}

function renderGrabMenuPicker(){
const picker=document.getElementById('grabMenuPicker');
if(!picker)return;
const searchVal=(document.getElementById('grabMenuSearch')?.value||'').trim().toLowerCase();
let activeMenu=state.menu.filter(m=>m.active);
if(searchVal){activeMenu=activeMenu.filter(m=>m.name.toLowerCase().includes(searchVal));}
picker.innerHTML=activeMenu.map(m=>{
    const sel=grabCurrentItems.find(g=>g.menuId===m.id);
    const qty=sel?sel.qty:0;
    return `<div class="grab-menu-btn ${qty>0?'selected':''}" onclick="toggleGrabItem(${m.id})">${m.name}${qty>1?' ×'+qty:''}</div>`;
}).join('')||'<div style="padding:10px;color:var(--text-muted);font-size:0.78rem;">Không tìm thấy</div>';
updateGrabSelected();
}

function toggleGrabItem(menuId){
const ex=grabCurrentItems.find(g=>g.menuId===menuId);
if(ex){ex.qty++;} else {
    const m=state.menu.find(x=>x.id===menuId);
    if(m)grabCurrentItems.push({menuId:m.id,name:m.name,price:m.price,qty:1});
}
renderGrabMenuPicker();
}

function updateGrabSelected(){
const el=document.getElementById('grabSelectedItems');
const mt=document.getElementById('grabMenuTotal');
if(!el||!mt)return;
if(!grabCurrentItems.length){el.innerHTML='Chưa chọn món';mt.textContent='0đ';return;}
const total=grabCurrentItems.reduce((s,i)=>s+i.price*i.qty,0);
el.innerHTML=grabCurrentItems.map(i=>`<span style="display:inline-block;padding:2px 8px;background:rgba(232,166,53,0.1);border-radius:6px;margin:2px;font-size:0.78rem;">${i.name}×${i.qty} <span style="cursor:pointer;color:var(--accent-red);margin-left:4px;" onclick="removeGrabItem(${i.menuId})">✕</span> <span style="cursor:pointer;color:var(--accent-green);margin-left:2px;" onclick="decGrabItem(${i.menuId})">−</span></span>`).join(' ');
mt.textContent=fmtP(total);
calcGrabDiff();
}

function removeGrabItem(menuId){grabCurrentItems=grabCurrentItems.filter(i=>i.menuId!==menuId);renderGrabMenuPicker();}
function decGrabItem(menuId){const i=grabCurrentItems.find(g=>g.menuId===menuId);if(i){i.qty--;if(i.qty<=0)grabCurrentItems=grabCurrentItems.filter(g=>g.menuId!==menuId);}renderGrabMenuPicker();}

function calcGrabDiff(){
const menuTotal=grabCurrentItems.reduce((s,i)=>s+i.price*i.qty,0);
const grabPrice=parseInt(document.getElementById('grabPrice')?.value)||0;
const diff=grabPrice-menuTotal;
const diffEl=document.getElementById('grabDiff');
const feeEl=document.getElementById('grabFee');
const netEl=document.getElementById('grabNet');
if(diffEl){
    if(grabPrice>0){diffEl.textContent=(diff>=0?'+':'')+fmtP(diff);diffEl.className='grab-diff '+(diff>=0?'positive':'negative');}
    else{diffEl.textContent='';diffEl.className='grab-diff';}
}
if(feeEl)feeEl.textContent=grabPrice>0?'-'+fmtP(Math.round(grabPrice*GRAB_FEE_RATE)):'0đ';
if(netEl)netEl.textContent=grabPrice>0?fmtP(Math.round(grabPrice*(1-GRAB_FEE_RATE))):'0đ';
}

function addGrabOrder(){
if(!grabCurrentItems.length){toast('⚠️ Chưa chọn món');return;}
const grabPrice=parseInt(document.getElementById('grabPrice')?.value)||0;
if(!grabPrice){toast('⚠️ Nhập giá Grab');return;}
const menuTotal=grabCurrentItems.reduce((s,i)=>s+i.price*i.qty,0);
const fee=Math.round(grabPrice*GRAB_FEE_RATE);
const net=grabPrice-fee;
// Save grab order
if(!state.grabOrders)state.grabOrders=[];
state.grabOrders.push({
    date:today(),time:nowTime(),
    items:grabCurrentItems.map(i=>({...i})),
    menuTotal:menuTotal,
    grabPrice:grabPrice,
    fee:fee,
    netAmount:net
});
// Also create a hidden invoice for ingredient tracking (method='grab')
const inv={id:state.nextInvoiceId++,date:today(),time:nowTime(),hour:nowHour(),items:grabCurrentItems.map(i=>({...i})),total:grabPrice,method:'grab',note:'Đơn Grab'};
state.todayInvoices.push(inv);
archiveDay(today(),state.todayInvoices);
// Reset form
grabCurrentItems=[];
document.getElementById('grabPrice').value='';
const gms=document.getElementById('grabMenuSearch');if(gms)gms.value='';
calcGrabDiff();
saveState();
renderGrabSection();
renderTodayInvoices();
toast(`✅ Đã thêm đơn Grab — thực nhận ${fmtP(net)}`);
}

function deleteGrabOrder(idx){
if(!confirm('Xóa đơn Grab này?'))return;
const g=state.grabOrders[idx];
if(g){
    // Also cancel the corresponding invoice
    const inv=state.todayInvoices.find(i=>i.method==='grab'&&i.time===g.time&&i.total===g.grabPrice);
    if(inv)inv.cancelled=true;
}
state.grabOrders.splice(idx,1);
archiveDay(today(),state.todayInvoices);
saveState();renderGrabSection();renderTodayInvoices();toast('🗑️ Đã xóa đơn Grab');
}

function renderGrabList(){
const list=document.getElementById('grabList');
const summary=document.getElementById('grabSummary');
const count=document.getElementById('grabCount');
if(!list||!summary)return;
const todayGrabs=(state.grabOrders||[]).filter(g=>g.date===today());
if(count)count.textContent=todayGrabs.length?`(${todayGrabs.length} đơn)`:'';
if(!todayGrabs.length){list.innerHTML='';summary.style.display='none';return;}
summary.style.display='grid';
const totalGross=todayGrabs.reduce((s,g)=>s+g.grabPrice,0);
const totalNet=todayGrabs.reduce((s,g)=>s+g.netAmount,0);
// Calculate ingredient cost for all grab orders
let ingCost=0;
todayGrabs.forEach(g=>{
    (g.items||[]).forEach(item=>{
        const mi=state.menu.find(m=>m.name===item.name||m.id===item.menuId);
        if(!mi)return;
        const recipe=state.recipes[mi.id]||[];
        recipe.forEach(r=>{
            const ing=state.ingredients.find(i=>i.id===r.ingId);
            if(ing)ingCost+=r.qty*item.qty*ing.unitPrice;
        });
    });
});
ingCost=Math.round(ingCost);
document.getElementById('grabTotalOrders').textContent=todayGrabs.length;
document.getElementById('grabTotalGross').textContent=fmtP(totalGross);
document.getElementById('grabTotalNet').textContent=fmtP(totalNet);
const ingCostEl=document.getElementById('grabIngCost');
if(ingCostEl){
    ingCostEl.textContent=ingCost>0?fmtP(ingCost):'Chưa có CT';
    // Show profit after ingredient cost
    if(ingCost>0){
        const profit=totalNet-ingCost;
        ingCostEl.innerHTML=fmtP(ingCost)+`<div style="font-size:0.65rem;color:${profit>=0?'var(--accent-green)':'var(--accent-red)'};margin-top:2px;">Lãi: ${fmtP(profit)}</div>`;
    }
}
list.innerHTML=todayGrabs.map((g,idx)=>{
    const items=g.items.map(i=>`${i.name}×${i.qty}`).join(', ');
    return `<div class="grab-item"><span class="gi-items">${esc(items)}</span><span class="gi-prices"><span class="gi-menu">${fmtP(g.menuTotal)}</span><span class="gi-grab">${fmtP(g.grabPrice)}</span><span class="gi-net">→${fmtP(g.netAmount)}</span></span><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:0.7rem;margin-left:8px;" onclick="deleteGrabOrder(${idx})">✕</button></div>`;
}).join('');
}

// ═══════════════════════════════════════
// EXPORT & BACKUP
// ═══════════════════════════════════════
function exportCSV(){const d=getDashData();let csv='Tên món,Số lượng,Doanh thu\n';Object.entries(d.itemsSold).sort((a,b)=>b[1].qty-a[1].qty).forEach(([n,x])=>{csv+=`"${n}",${x.qty},${x.revenue}\n`;});csv+=`\nTổng doanh thu,,${d.totalRevenue}\nTổng hóa đơn,,${d.totalInvoices}\nTiền mặt,,${d.cashTotal}\nChuyển khoản,,${d.transferTotal}\n`;navigator.clipboard.writeText(csv).then(()=>toast('📋 Đã copy CSV!'));}
function exportDashJSON(){const b=new Blob([JSON.stringify(state.history,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`monstea-data-${today()}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);toast('💾 Đã tải JSON!');}
function exportAttCSV(){const td=today(),recs=state.attendance[td]||[];let csv='Tên,Vào ca,Ra ca,Số giờ\n';recs.forEach(r=>{csv+=`"${r.name}","${r.checkIn}","${r.checkOut||''}",${r.hours||''}\n`;});navigator.clipboard.writeText(csv).then(()=>toast('📋 Đã copy CSV chấm công!'));}
function downloadBackup(){const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`monstea-backup-${today()}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);toast('📥 Đã tải backup!');}
function restoreBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{const p=JSON.parse(ev.target.result);if(!p.menu){toast('❌ File không hợp lệ');return;}state={...state,...p};localStorage.setItem('monsteaPOS',JSON.stringify(state));if(firebaseDb){isRemoteUpdate=true;firebaseDb.ref('state').set(state).then(()=>{isRemoteUpdate=false;updateSyncStatus('connected');toast('✅ Đã khôi phục & đồng bộ lên cloud!');}).catch(()=>{isRemoteUpdate=false;toast('✅ Đã khôi phục (chưa sync cloud)');});}else{toast('✅ Đã khôi phục!');}renderAll();}catch(err){toast('❌ Lỗi: '+err.message);}};r.readAsText(f);e.target.value='';}
function clearOldData(){const c=new Date();c.setDate(c.getDate()-30);const cs=c.toISOString().slice(0,10);let rm=0;Object.keys(state.history).forEach(d=>{if(d<cs){delete state.history[d];rm++;}});Object.keys(state.attendance).forEach(d=>{if(d<cs){delete state.attendance[d];rm++;}});saveState();toast(`🗑️ Đã xóa ${rm} bản ghi cũ`);}

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
function fmtP(n){return Math.round(n).toLocaleString('vi-VN')+'đ';}
function fmtS(n){return n>=1000000?(n/1000000).toFixed(1)+'tr':n>=1000?Math.round(n/1000)+'k':n+'';}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function toast(m){const e=document.createElement('div');e.className='toast';e.textContent=m;document.getElementById('toastContainer').appendChild(e);setTimeout(()=>e.remove(),3000);}
function vibrate(ms){try{navigator.vibrate(ms||30);}catch(e){}}
function playPaySound(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o1=ctx.createOscillator(),g1=ctx.createGain();o1.connect(g1);g1.connect(ctx.destination);o1.type='sine';o1.frequency.value=800;g1.gain.setValueAtTime(0.3,ctx.currentTime);g1.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.3);o1.start(ctx.currentTime);o1.stop(ctx.currentTime+0.3);const o2=ctx.createOscillator(),g2=ctx.createGain();o2.connect(g2);g2.connect(ctx.destination);o2.type='sine';o2.frequency.value=1200;g2.gain.setValueAtTime(0.3,ctx.currentTime+0.15);g2.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.5);o2.start(ctx.currentTime+0.15);o2.stop(ctx.currentTime+0.5);}catch(e){}}
function updateMobileBar(){const bar=document.getElementById('mobileOrderBar');if(!bar)return;const ct=document.getElementById('mobCount'),tt=document.getElementById('mobTotal');const tq=state.currentOrder.reduce((s,o)=>s+o.qty,0),ta=state.currentOrder.reduce((s,o)=>{const tp=(o.toppings||[]).reduce((st,t)=>st+t.price,0);return s+(o.price+tp)*o.qty;},0);const disc=getDiscountAmount();const final=Math.max(0,ta-disc);if(tq>0){bar.classList.add('has-items');ct.textContent=tq+' món';tt.textContent=fmtP(final);}else{bar.classList.remove('has-items');}}
function openModal(t,b){document.getElementById('modalTitle').textContent=t;document.getElementById('modalBody').innerHTML=b;document.getElementById('modal').classList.add('active');}
function closeModal(){document.getElementById('modal').classList.remove('active');}

// ═══════════════════════════════════════
// GUIDE (Hướng dẫn pha chế)
// ═══════════════════════════════════════
let guideCategory='Tất cả';
function renderGuide(){
    const ct=document.getElementById('guideCatTabs');if(!ct)return;
    ct.innerHTML=['Tất cả',...state.categories].map(c=>`<button class="cat-btn ${c===guideCategory?'active':''}" onclick="setGuideCategory('${c}')">${c}</button>`).join('');
    const g=document.getElementById('guideMenuGrid');
    const items=state.menu.filter(m=>m.active&&(guideCategory==='Tất cả'||m.category===guideCategory));
    let html=items.map(m=>{
        const hasGuide=(state.menuGuides&&state.menuGuides[m.id])||((state.guideImages&&state.guideImages[m.id]&&state.guideImages[m.id].length));
        const vis=getMenuVisual(m);
        return `<div class="menu-item-btn" style="position:relative;${hasGuide?'border-color:rgba(74,222,128,0.4);':''}" onclick="showGuide(${m.id})">
        ${hasGuide?'<span style="position:absolute;top:4px;right:6px;font-size:0.6rem;">✅</span>':''}
        ${vis}<div class="mi-name">${esc(m.name)}</div>
        <div style="font-size:0.65rem;color:${hasGuide?'var(--accent-green)':'var(--text-muted)'};">${hasGuide?'Đã có HD':'Chưa có'}</div></div>`;
    }).join('');
    if(!html) html='<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Chưa có món</div>';
    if(currentRole==='owner'){
        html+=`<div class="menu-item-btn" style="border:2px dashed var(--border-subtle);background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0.8;cursor:pointer;min-height:100px;box-shadow:none;" onclick="addCustomGuide()">
        <div style="font-size:2rem;margin-bottom:4px;line-height:1;">➕</div>
        <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">Thêm HD mới</div></div>`;
    }
    g.innerHTML=html;
}
function addCustomGuide(){
    const n=prompt('Tên hướng dẫn mới (VD: Cách ủ trà đen):');
    if(!n)return;
    const cat=guideCategory==='Tất cả'?(state.categories[0]||'Khác'):guideCategory;
    const newId=state.nextMenuId++;
    state.menu.push({id:newId,name:n,price:0,category:cat,active:true,isGuide:true});
    saveState();
    renderGuide();
    showGuide(newId);
    toast('✅ Đã tạo hướng dẫn mới');
}
function setGuideCategory(c){guideCategory=c;renderGuide();}
function showGuide(id){
    const m=state.menu.find(x=>x.id===id);if(!m)return;
    const guide=(state.menuGuides&&state.menuGuides[id])||'';
    const imgs=(state.guideImages&&state.guideImages[id])||[];
    const isOwner=currentRole==='owner';
    const imgGallery=imgs.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;">${imgs.map((src,i)=>`<div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);">
    <img src="${src}" style="width:120px;height:120px;object-fit:cover;display:block;cursor:pointer;" onclick="window.open(this.src,'_blank')">
    ${isOwner?`<button onclick="removeGuideImage(${id},${i})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.7);color:#ff6b6b;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:0.7rem;display:flex;align-items:center;justify-content:center;">✕</button>`:''}
    </div>`).join('')}</div>`:'';
    const body=`<div style="display:flex;flex-direction:column;gap:12px;">
    <div><div style="font-weight:700;font-size:1rem;">${esc(m.name)}</div>
    <div style="font-size:0.82rem;color:var(--accent-warm);">${fmtP(m.price)} — ${esc(m.category)}</div></div>
    ${isOwner?`<textarea id="guideText" rows="8" style="width:100%;padding:10px;font-size:0.85rem;line-height:1.6;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-card);color:var(--text-primary);resize:vertical;" placeholder="Nhập hướng dẫn pha chế...">${esc(guide)}</textarea>
    ${imgGallery}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
    📷 Thêm ảnh <input type="file" accept="image/*" capture="environment" multiple style="display:none;" onchange="addGuideImage(${m.id},this.files)">
    </label>
    <span style="font-size:0.7rem;color:var(--text-muted);">${imgs.length}/5 ảnh</span>
    </div>
    <button class="btn btn-primary" onclick="saveGuide(${m.id})">💾 Lưu hướng dẫn</button>`
    :`${imgGallery}
    <div style="padding:16px;background:var(--bg-card);border-radius:var(--radius-md);border:1px solid var(--border-subtle);white-space:pre-wrap;line-height:1.7;font-size:0.88rem;min-height:60px;">${guide?esc(guide):'<span style="color:var(--text-muted);font-style:italic;">Chưa có hướng dẫn</span>'}</div>`}
    </div>`;
    openModal(`📖 ${m.name}`,body);
}
function compressImage(file,maxW,quality){return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=reject;
    reader.onload=e=>{
        const img=new Image();img.onerror=reject;
        img.onload=()=>{
            const ratio=Math.min(maxW/img.width,maxW/img.height,1);
            const w=Math.round(img.width*ratio),h=Math.round(img.height*ratio);
            const c=document.createElement('canvas');c.width=w;c.height=h;
            c.getContext('2d').drawImage(img,0,0,w,h);
            resolve(c.toDataURL('image/jpeg',quality));
        };img.src=e.target.result;
    };reader.readAsDataURL(file);
});}
function addGuideImage(id,files){
    if(!state.guideImages)state.guideImages={};
    if(!state.guideImages[id])state.guideImages[id]=[];
    const current=state.guideImages[id];
    if(current.length>=5){toast('⚠️ Tối đa 5 ảnh');return;}
    const remaining=5-current.length;
    const toProcess=Array.from(files).slice(0,remaining);
    toast(`📷 Đang nén ${toProcess.length} ảnh...`);
    Promise.all(toProcess.map(f=>compressImage(f,600,0.5))).then(results=>{
        state.guideImages[id].push(...results);
        saveState();showGuide(id);renderGuide();
        toast(`✅ Đã thêm ${results.length} ảnh`);
    }).catch(()=>toast('❌ Lỗi xử lý ảnh'));
}
function removeGuideImage(id,idx){
    if(!confirm('Xóa ảnh này?'))return;
    state.guideImages[id].splice(idx,1);
    saveState();showGuide(id);renderGuide();
    toast('🗑️ Đã xóa ảnh');
}
function saveGuide(id){
    const txt=document.getElementById('guideText').value;
    if(!state.menuGuides)state.menuGuides={};
    state.menuGuides[id]=txt;
    saveState();renderGuide();closeModal();
    toast('✅ Đã lưu hướng dẫn');
}

// ═══════════════════════════════════════
// HELP ALERT (cross-device via Firebase)
// ═══════════════════════════════════════
function playHelpSound(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();
function beep(freq,start,dur){const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(0.5,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+start+dur);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur);}
beep(880,0,0.3);beep(1100,0.15,0.3);beep(880,0.6,0.3);beep(1100,0.75,0.3);
const btn=document.getElementById('helpBtn');if(btn){btn.classList.add('ringing');setTimeout(()=>btn.classList.remove('ringing'),1600);}
}catch(e){}}
function sendHelpAlert(){const now=Date.now();if(now-lastHelpTs<3000){toast('⏳ Đợi 3 giây');return;}lastHelpTs=now;
playHelpSound();vibrate(300);toast('🔔 Đang gọi hỗ trợ...');
if(firebaseReady&&firebaseDb){firebaseDb.ref('helpAlert').set({ts:now,from:currentStaffName||'?'});}}
function listenHelpAlert(){if(!firebaseDb)return;
firebaseDb.ref('helpAlert').on('value',snap=>{const v=snap.val();if(!v||!v.ts)return;
if(v.ts>lastHelpTs&&Date.now()-v.ts<5000){lastHelpTs=v.ts;playHelpSound();vibrate(500);toast(`🔔 ${v.from} cần hỗ trợ!`);}});}

// ═══════════════════════════════════════
// WEEKLY SCHEDULE
// ═══════════════════════════════════════
function getISOWeekKey(offset){const d=new Date();d.setDate(d.getDate()+offset*7);
const thu=new Date(d);thu.setDate(thu.getDate()-((d.getDay()+6)%7)+3);
const yr=thu.getFullYear();const wk=Math.ceil(((thu-new Date(yr,0,4))/86400000+new Date(yr,0,4).getDay()+1)/7);
return `${yr}-W${String(wk).padStart(2,'0')}`;}
function getWeekDates(offset){const d=new Date();d.setDate(d.getDate()+offset*7);
const mon=new Date(d);mon.setDate(mon.getDate()-((d.getDay()+6)%7));
const dates=[];for(let i=0;i<7;i++){const dd=new Date(mon);dd.setDate(mon.getDate()+i);dates.push(dd);}return dates;}
function shiftScheduleWeek(dir){scheduleWeekOffset+=dir;renderWeekSchedule();}
function renderWeekSchedule(){const wk=getISOWeekKey(scheduleWeekOffset);
const dates=getWeekDates(scheduleWeekOffset);
const dayNames=['T2','T3','T4','T5','T6','T7','CN'];
const label=document.getElementById('scheduleWeekLabel');
if(label)label.textContent=`${dates[0].getDate()}/${dates[0].getMonth()+1} — ${dates[6].getDate()}/${dates[6].getMonth()+1}`;
if(!state.weekSchedule)state.weekSchedule={};
if(!state.weekSchedule[wk])state.weekSchedule[wk]={};
const sched=state.weekSchedule[wk];
const isPast=scheduleWeekOffset<0;
const grid=document.getElementById('weekScheduleGrid');if(!grid)return;
let html=`<table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
<thead><tr style="border-bottom:2px solid var(--border-subtle);">
<th style="padding:4px;text-align:left;">NV</th>`;
dayNames.forEach((d,i)=>{const isToday=dates[i].toISOString().slice(0,10)===today();
html+=`<th style="padding:4px;text-align:center;${isToday?'color:var(--accent);font-weight:800;':''}">${d}<br><span style="font-size:0.6rem;font-weight:400;color:var(--text-muted)">${dates[i].getDate()}</span></th>`;});
html+=`</tr></thead><tbody>`;
state.staff.forEach(s=>{if(!sched[s.id])sched[s.id]=[false,false,false,false,false,false,false];
const canEdit=!isPast&&(currentRole==='owner'||currentStaffId===s.id);
const isMyRow=currentStaffId===s.id;
html+=`<tr style="border-bottom:1px solid rgba(255,255,255,0.03);${isMyRow?'background:rgba(96,165,250,0.06);':''}">
<td style="padding:6px 4px;font-weight:600;white-space:nowrap;">${esc(s.name)}</td>`;
for(let i=0;i<7;i++){const checked=sched[s.id][i];
html+=`<td style="text-align:center;padding:4px;"><div style="width:28px;height:28px;margin:auto;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:${canEdit?'pointer':'default'};
background:${checked?'rgba(74,222,128,0.15)':'rgba(255,255,255,0.03)'};border:1px solid ${checked?'rgba(74,222,128,0.3)':'var(--border-subtle)'};font-size:0.7rem;"
onclick="${canEdit?`toggleSchedule(${s.id},${i},'${wk}')`:''}">${checked?'✅':''}</div></td>`;}
html+=`</tr>`;});
html+=`</tbody></table>`;
if(isPast)html+=`<div style="text-align:center;font-size:0.7rem;color:var(--text-muted);margin-top:6px;">📖 Tuần cũ — chỉ xem</div>`;
grid.innerHTML=html;}
function toggleSchedule(staffId,dayIdx,wk){if(!state.weekSchedule[wk])state.weekSchedule[wk]={};
if(!state.weekSchedule[wk][staffId])state.weekSchedule[wk][staffId]=[false,false,false,false,false,false,false];
state.weekSchedule[wk][staffId][dayIdx]=!state.weekSchedule[wk][staffId][dayIdx];
saveState();renderWeekSchedule();}

// ═══════════════════════════════════════
// SWIPE TABS (mobile)
// ═══════════════════════════════════════
(function(){const ct=document.getElementById('posCatTabs');if(!ct)return;let sx=0;
ct.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;},{passive:true});
ct.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)<50)return;
const cats=['Tất cả',...state.categories];const ci=cats.indexOf(posCategory);
if(dx<0&&ci<cats.length-1)setPosCategory(cats[ci+1]);
else if(dx>0&&ci>0)setPosCategory(cats[ci-1]);
const ab=ct.querySelector('.cat-btn.active');if(ab)ab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
},{passive:true});})();

document.addEventListener('keydown',e=>{if(!document.getElementById('tab-pos').classList.contains('active'))return;if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;if(e.key==='Enter'&&state.currentOrder.length>0){e.preventDefault();payOrder('cash');}if(e.key==='Escape')clearOrder();});

// Auto-login from session
loadState(); // Load saved state BEFORE session restore (for ownerPassword, staff passwords)
const _sp=sessionStorage.getItem('monsteaPwd');
if(_sp){
if(_sp===state.ownerPassword){currentRole='owner';currentStaffId=null;currentStaffName='Chủ quán';document.getElementById('loginOverlay').style.display='none';applyRole();initFirebase();}
else{const sm=state.staff.find(s=>s.password===_sp);if(sm){currentRole='staff';currentStaffId=sm.id;currentStaffName=sm.name;document.getElementById('loginOverlay').style.display='none';applyRole();initFirebase();}}
}else{document.getElementById('loginPwd').focus();}

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
    currentOrder:[], todayInvoices:[], invoiceArchive:{}, grabOrders:[], history:{}, attendance:{}, editLog:[],
    purchases:{}, expenses:{}, manualUsage:{}, prepTracking:{}, dailyNotes:[],
    openChecklist:DEFAULT_OPEN_CL.map((t,i)=>({id:i+1,text:t,checked:false})),
    closeChecklist:DEFAULT_CLOSE_CL.map((t,i)=>({id:i+1,text:t,checked:false})),
    checklistDate:'', nextMenuId:13, nextStaffId:5, nextInvoiceId:1, nextClId:20, nextIngId:125, nextTplId:1,
    nextPurchaseId:1, nextExpenseId:1, nextStockOutId:1, nextPrepId:1,
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
// CUSTOM CONFIRM MODAL
// ═══════════════════════════════════════
function confirmAction(msg, onYes, btnLabel){
    const lbl=btnLabel||'Xóa';
    const btnColor=lbl==='Xóa'||lbl==='Hủy đơn'?'var(--accent-red,#ff6b6b)':'var(--accent-green,#4ade80)';
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML=`<div style="background:var(--surface-card,#1e1a2e);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;max-width:320px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
        <div style="font-size:0.95rem;margin-bottom:20px;color:var(--text-primary,#f0ece4);line-height:1.5;">${msg}</div>
        <div style="display:flex;gap:10px;justify-content:center;">
            <button id="cfmNo" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:var(--text-primary,#f0ece4);cursor:pointer;font-size:0.85rem;">Hủy</button>
            <button id="cfmYes" style="flex:1;padding:10px;border-radius:8px;border:none;background:${btnColor};color:white;cursor:pointer;font-weight:700;font-size:0.85rem;">${lbl}</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cfmNo').onclick=()=>overlay.remove();
    overlay.querySelector('#cfmYes').onclick=()=>{overlay.remove();onYes();};
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

// ═══════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════
function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function nowTime(){return new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
function nowHour(){return new Date().getHours()}
function removeDiacritics(str){
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');
}
function searchMatch(text,query){
    return removeDiacritics(text.toLowerCase()).includes(removeDiacritics(query.toLowerCase()));
}
function cloneData(v){return JSON.parse(JSON.stringify(v||{}));}
function isDeleted(item){return !!(item&&item._deleted);}
function activeItems(list){return (list||[]).filter(item=>!isDeleted(item));}
function getDeviceId(){
    let id=localStorage.getItem('monsteaDeviceId');
    if(!id){id='dev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);localStorage.setItem('monsteaDeviceId',id);}
    return id;
}
function makeSyncId(prefix){return `${today()}-${Date.now().toString(36)}-${getDeviceId()}-${Math.random().toString(36).slice(2,7)}-${prefix||'inv'}`;}
function invoiceKey(inv){return `${inv.syncId||inv.id}_${inv.date||''}`;}
function invoiceRef(inv){return String(inv&&(inv.syncId||`${inv.date||today()}:${inv.id}`));}
function jsString(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');}
function findInvoiceByRef(ref,includeCancelled){
    const td=today(),key=String(ref);
    return [...(state.todayInvoices||[])].reverse().find(i=>i.date===td&&(includeCancelled||!i.cancelled)&&(invoiceRef(i)===key||(!i.syncId&&String(i.id)===key)));
}
function findInvoiceIndexByRef(ref){
    const td=today(),key=String(ref);
    for(let idx=(state.todayInvoices||[]).length-1;idx>=0;idx--){
        const i=state.todayInvoices[idx];
        if(i&&i.date===td&&!i.cancelled&&(invoiceRef(i)===key||(!i.syncId&&String(i.id)===key)))return idx;
    }
    return -1;
}
function itemStamp(item){return Number(item&&item._lastModified)||0;}
function syncKey(prefix,item,keyField){
    if(!item)return '';
    if(item.syncId)return item.syncId;
    return `${prefix||keyField}:${item[keyField]!==undefined?item[keyField]:''}`;
}
function itemRef(item){return String(item&&(item.syncId||item.id));}
function findByRef(list,ref){const key=String(ref);return (list||[]).find(item=>item&&(itemRef(item)===key||(!item.syncId&&String(item.id)===key)));}
function preferNewerItem(old,item,resolver){
    if(!old)return item;
    if(resolver)return resolver(old,item);
    const oldStamp=itemStamp(old),newStamp=itemStamp(item);
    if(newStamp>oldStamp)return item;
    if(newStamp<oldStamp)return old;
    if(isDeleted(item)&&!isDeleted(old))return item;
    return old;
}
function mergeArrayByKey(remoteArr,localArr,keyFn,preferNewer,resolver){
    const map=new Map();
    (remoteArr||[]).forEach(item=>{const key=item&&keyFn(item);if(key)map.set(key,item);});
    (localArr||[]).forEach(item=>{
        if(!item)return;
        const key=keyFn(item),old=map.get(key);
        if(!old)map.set(key,item);
        else if(preferNewer)map.set(key,preferNewerItem(old,item,resolver));
    });
    return [...map.values()];
}
function attendanceScore(r){return (r&&r.checkIn?1:0)+(r&&r.checkOut?3:0)+(r&&r.hours?1:0);}
function mergeAttendanceRecord(old,item){
    const oldStamp=itemStamp(old),newStamp=itemStamp(item);
    if(newStamp>oldStamp)return item;
    if(newStamp<oldStamp)return old;
    return attendanceScore(item)>attendanceScore(old)?item:old;
}
function mergeByDateBuckets(remoteData,localData,keyFnOrField,prefix,resolver){
    const remote=cloneData(remoteData),local=cloneData(localData);
    const out=remote||{};
    const allDates=new Set([...Object.keys(out),...Object.keys(local||{})]);
    const keyFn=typeof keyFnOrField==='function'?keyFnOrField:(item=>syncKey(prefix,item,keyFnOrField));
    allDates.forEach(d=>{
        out[d]=mergeArrayByKey(out[d]||[],(local||{})[d]||[],keyFn,true,resolver);
    });
    return out;
}
function mergeHistory(remoteHistory,localHistory){
    const out=cloneData(remoteHistory);
    const local=cloneData(localHistory);
    Object.keys(local||{}).forEach(d=>{
        if(!out[d])out[d]=local[d];
        else if(itemStamp(local[d])>itemStamp(out[d])||(local[d].invoices||0)>(out[d].invoices||0))out[d]=local[d];
    });
    return out;
}
function bumpNextFromArray(obj,field,nextField){
    const ids=(obj[field]||[]).map(x=>Number(x.id)).filter(Number.isFinite);
    if(ids.length)obj[nextField]=Math.max(obj[nextField]||1,...ids)+1;
}
function bumpNextFromBuckets(obj,field,nextField){
    const ids=[];
    Object.values(obj[field]||{}).forEach(list=>(list||[]).forEach(x=>{const id=Number(x.id);if(Number.isFinite(id))ids.push(id);}));
    if(ids.length)obj[nextField]=Math.max(obj[nextField]||1,...ids)+1;
}
function mergeStateData(remoteState,localState,preferLocalRoot){
    const remote=cloneData(remoteState),local=cloneData(localState);
    const merged=preferLocalRoot?{...remote,...local}:{...local,...remote};
    merged.todayInvoices=mergeArrayByKey(remote.todayInvoices||[],local.todayInvoices||[],invoiceKey,true);
    merged.invoiceArchive=mergeByDateBuckets(remote.invoiceArchive,local.invoiceArchive,invoiceKey,'invoice');
    merged.grabOrders=mergeArrayByKey(remote.grabOrders||[],local.grabOrders||[],g=>g.syncId||`${g.time}_${g.date}`,true);
    merged.attendance=mergeByDateBuckets(remote.attendance,local.attendance,item=>item.staffId,'attendance',mergeAttendanceRecord);
    merged.purchases=mergeByDateBuckets(remote.purchases,local.purchases,'id','purchase');
    merged.expenses=mergeByDateBuckets(remote.expenses,local.expenses,'id','expense');
    merged.manualUsage=mergeByDateBuckets(remote.manualUsage,local.manualUsage,'id','stockout');
    merged.prepTracking=mergeByDateBuckets(remote.prepTracking,local.prepTracking,'id','prep');
    merged.menu=mergeArrayByKey(remote.menu||[],local.menu||[],m=>m.id,true);
    merged.staff=mergeArrayByKey(remote.staff||[],local.staff||[],s=>s.id,true);
    merged.ingredients=mergeArrayByKey(remote.ingredients||[],local.ingredients||[],i=>i.id,true);
    merged.recipeTemplates=mergeArrayByKey(remote.recipeTemplates||[],local.recipeTemplates||[],t=>t.id,true);
    merged.history=mergeHistory(remote.history,local.history);
    bumpNextFromArray(merged,'todayInvoices','nextInvoiceId');
    bumpNextFromArray(merged,'menu','nextMenuId');
    bumpNextFromArray(merged,'staff','nextStaffId');
    bumpNextFromArray(merged,'ingredients','nextIngId');
    bumpNextFromArray(merged,'recipeTemplates','nextTplId');
    bumpNextFromBuckets(merged,'purchases','nextPurchaseId');
    bumpNextFromBuckets(merged,'expenses','nextExpenseId');
    bumpNextFromBuckets(merged,'manualUsage','nextStockOutId');
    bumpNextFromBuckets(merged,'prepTracking','nextPrepId');
    delete merged._syncRole;
    return merged;
}
function stateForFirebase(){
    const s=cloneData(state);
    s.currentOrder=[];
    s._syncRole=currentRole||'unknown';
    delete s._editingInvoiceId;
    delete s._editingInvoiceRef;
    delete s._editingOldSummary;
    if(currentRole!=='owner'){
        delete s.menu;delete s.categories;delete s.staff;delete s.recipes;delete s.recipeTemplates;
        delete s.weekSchedule;delete s.menuGuides;delete s.guideImages;
        delete s.password;delete s.ownerPassword;delete s.nextMenuId;delete s.nextStaffId;delete s.nextTplId;
    }
    return s;
}
function archiveRawInvoices(list,excludeDate){
  if(!state.invoiceArchive)state.invoiceArchive={};
  (list||[]).forEach(inv=>{
    if(!inv||!inv.date||inv.date===excludeDate)return;
    if(!state.invoiceArchive[inv.date])state.invoiceArchive[inv.date]=[];
    state.invoiceArchive[inv.date]=mergeArrayByKey(state.invoiceArchive[inv.date],[inv],invoiceKey,true);
  });
}
function persistMergedState(localOrder){
  if(state.ingredients)state.ingredients.forEach(i=>{if(i.sln===undefined)i.sln=1;if(i.openStock===undefined)i.openStock=0;if(i.warnLevel===undefined)i.warnLevel=0;if(i.hidden===undefined)i.hidden=false;});
  const td=today();archiveRawInvoices(state.todayInvoices,td);state.todayInvoices=(state.todayInvoices||[]).filter(i=>i.date===td);
  if(localOrder)state.currentOrder=localOrder;
  localStorage.setItem('monsteaPOS',JSON.stringify(state));
}
function saveState(){try{localStorage.setItem('monsteaPOS',JSON.stringify(state));if(!isRemoteUpdate&&firebaseReady)saveStateToFirebase();}catch(e){}}
function loadState(){try{const s=localStorage.getItem('monsteaPOS');if(s){const p=JSON.parse(s);state={...state,...p};if(!state.ingredients)state.ingredients=[...DEFAULT_INGREDIENTS];if(!state.recipes)state.recipes={};if(!state.recipeTemplates)state.recipeTemplates=[];if(!state.editLog)state.editLog=[];if(!state.password)state.password='1234';if(!state.nextIngId)state.nextIngId=125;if(!state.nextTplId)state.nextTplId=1;if(!state.purchases)state.purchases={};if(!state.expenses)state.expenses={};if(!state.dailyNotes)state.dailyNotes=[];
if(!Array.isArray(state.todayInvoices))state.todayInvoices=[];
if(!state.invoiceArchive)state.invoiceArchive={};
if(!Array.isArray(state.grabOrders))state.grabOrders=[];
if(!Array.isArray(state.currentOrder))state.currentOrder=[];
// Migrate staff: add password+wageRate if missing
state.staff.forEach((s,i)=>{if(!s.password)s.password=String((i+1)*1000);if(!s.wageRate)s.wageRate=25000;});
if(!state.weekSchedule)state.weekSchedule={};
if(!state.ownerPassword)state.ownerPassword='060997';
if(!state.menuGuides)state.menuGuides={};
if(!state.guideImages)state.guideImages={};
if(!state.manualUsage)state.manualUsage={};
if(!state.prepTracking)state.prepTracking={};
if(!state.nextStockOutId)state.nextStockOutId=1;
if(!state.nextPrepId)state.nextPrepId=1;
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
const staffMatch=activeItems(state.staff).find(s=>s.password===p);
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
function init(){loadState();checkNewDay();renderAll();startClock();if(currentRole)applyRole();setTimeout(autoBackup,5000);}
function renderAll(){renderPOSMenu();renderOrder();renderTodayInvoices();renderGrabSection();renderDashboard();renderAttendance();renderChecklist();renderSettings();renderInventory();renderRecipes();renderWeekSchedule();}



// ═══════════════════════════════════════
// FIREBASE SYNC
// ═══════════════════════════════════════
function mergeFirebaseState(r){
  const localOrder=state.currentOrder||[];
  state=mergeStateData(r,state,false);
  persistMergedState(localOrder);
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
  if(r){isRemoteUpdate=true;mergeFirebaseState(r);}
  firebaseReady=true;listenHelpAlert();init();isRemoteUpdate=false;updateSyncStatus('connected');return;}
if(!r)return;
isRemoteUpdate=true;mergeFirebaseState(r);
renderAll();isRemoteUpdate=false;});}

function saveStateToFirebase(){if(!firebaseDb)return;clearTimeout(syncTimeout);
syncTimeout=setTimeout(()=>{updateSyncStatus('syncing');
const localSnapshot=stateForFirebase();
firebaseDb.ref('state').transaction(remote=>mergeStateData(remote||{},localSnapshot,true),(err,committed,snap)=>{
    if(err){updateSyncStatus('offline');return;}
    if(committed&&snap&&snap.val()){isRemoteUpdate=true;mergeFirebaseState(snap.val());isRemoteUpdate=false;renderAll();}
    updateSyncStatus('connected');
});},500);}

function updateSyncStatus(s){const el=document.getElementById('syncStatus');if(!el)return;
const t={connected:'Đã kết nối',offline:'Mất kết nối',syncing:'Đang đồng bộ...'};
const backupInfo=state._lastBackup?` | 💾 ${state._lastBackup}`:'';
el.innerHTML=`<span class="sync-dot ${s}"></span>${t[s]||s}${backupInfo}`;}

// Auto-backup once per day
function autoBackup(){
    if(!firebaseDb||!firebaseReady)return;
    const td=today();
    if(state._lastBackupDate===td)return; // Already backed up today
    const backupData=cloneData(state);
    backupData.currentOrder=[];
    delete backupData._editingInvoiceId;
    delete backupData._editingInvoiceRef;
    delete backupData._editingOldSummary;
    backupData.timestamp=new Date().toISOString();
    backupData._backupVersion=2;
    firebaseDb.ref('backups/'+td).set(backupData).then(()=>{
        state._lastBackupDate=td;
        state._lastBackup=nowTime();
        saveState();
        console.log('[POS] Auto-backup saved: '+td);
        // Cleanup: keep only last 7 backups
        firebaseDb.ref('backups').orderByKey().once('value',snap=>{
            const keys=Object.keys(snap.val()||{}).sort();
            if(keys.length>7){keys.slice(0,keys.length-7).forEach(k=>firebaseDb.ref('backups/'+k).remove());}
        });
    }).catch(e=>console.warn('[POS] Backup failed:',e));
}
function checkNewDay(){const td=today();
// ONE-TIME CLEANUP: xóa ghost data ngày nghỉ (2/5 & 3/5/2026) — remove after 2026-05-15
['2026-05-02','2026-05-03'].forEach(d=>{if(state.history&&state.history[d]){delete state.history[d];console.log('[POS] Cleaned ghost history: '+d);}});
// Archive stale raw invoices before purging the working register.
const staleByDate={};
(state.todayInvoices||[]).forEach(inv=>{if(inv&&inv.date&&inv.date!==td){if(!staleByDate[inv.date])staleByDate[inv.date]=[];staleByDate[inv.date].push(inv);}});
Object.keys(staleByDate).forEach(d=>{archiveDay(d,staleByDate[d]);archiveRawInvoices(staleByDate[d],td);});
// ALWAYS purge stale invoices from other dates (root cause of ghost data)
const before=state.todayInvoices.length;
state.todayInvoices=state.todayInvoices.filter(i=>i.date===td);
if(state.todayInvoices.length!==before)console.log(`[POS] Purged ${before-state.todayInvoices.length} stale invoices from todayInvoices`);
if(state.checklistDate!==td){state.openChecklist.forEach(c=>c.checked=false);state.closeChecklist.forEach(c=>c.checked=false);state.checklistDate=td;
state.nextInvoiceId=state.todayInvoices.length?Math.max(...state.todayInvoices.map(i=>i.id))+1:1;saveState();}
}

function archiveDay(dk,invoices){invoices=activeItems(invoices).filter(i=>i.date===dk);if(!invoices.length)return;const is={},isById={};let tr=0,ct=0,tt=0,staffCount=0,staffOrigTotal=0;const hr={};let ac=0;
invoices.forEach(inv=>{if(inv.cancelled)return;
if(inv.method==='staff'){staffCount++;staffOrigTotal+=(inv.staffOriginalTotal||0);}
else{ac++;tr+=inv.total;if(inv.method==='cash')ct+=inv.total;else tt+=inv.total;
const h=parseInt(inv.time?.split(':')[0]||'0');hr[h]=(hr[h]||0)+inv.total;}
inv.items.forEach(i=>{if(!is[i.name])is[i.name]={qty:0,revenue:0};is[i.name].qty+=i.qty;if(inv.method!=='staff'){is[i.name].revenue+=i.price*i.qty;}
if(i.menuId){const key=String(i.menuId);if(!isById[key])isById[key]={name:i.name,qty:0,revenue:0};isById[key].qty+=i.qty;if(inv.method!=='staff'){isById[key].revenue+=i.price*i.qty;}}
(i.toppings||[]).forEach(t=>{if(!is[t.name])is[t.name]={qty:0,revenue:0};is[t.name].qty+=i.qty;if(inv.method!=='staff'){is[t.name].revenue+=t.price*i.qty;}});});});
const grabs=activeItems(state.grabOrders||[]).filter(g=>g.date===dk);
state.history[dk]={invoices:ac,totalRevenue:tr,cashTotal:ct,transferTotal:tt,staffOrders:staffCount,staffOriginalTotal:staffOrigTotal,itemsSold:is,itemsSoldById:isById,hourlyRevenue:hr,grabTotal:grabs.reduce((s,g)=>s+g.grabPrice,0),grabNet:grabs.reduce((s,g)=>s+g.netAmount,0),_lastModified:Date.now()};}


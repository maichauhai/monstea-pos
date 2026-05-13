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
let activeMenu=activeItems(state.menu).filter(m=>m.active);
if(searchVal){activeMenu=activeMenu.filter(m=>searchMatch(m.name,searchVal));}
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
    const m=activeItems(state.menu).find(x=>x.id===menuId);
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
const grabSyncId=makeSyncId('grab');
const invoiceSyncId=makeSyncId('grab-inv');
// Save grab order
if(!state.grabOrders)state.grabOrders=[];
state.grabOrders.push({
    syncId:grabSyncId,
    invoiceSyncId:invoiceSyncId,
    _lastModified:Date.now(),
    date:today(),time:nowTime(),
    items:grabCurrentItems.map(i=>({...i})),
    menuTotal:menuTotal,
    grabPrice:grabPrice,
    fee:fee,
    netAmount:net
});
// Also create a hidden invoice for ingredient tracking (method='grab')
const inv={id:state.nextInvoiceId++,syncId:invoiceSyncId,sourceGrabSyncId:grabSyncId,_lastModified:Date.now(),date:today(),time:nowTime(),hour:nowHour(),items:grabCurrentItems.map(i=>({...i})),total:grabPrice,method:'grab',note:'Đơn Grab'};
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

function deleteGrabOrder(ref){
if(!confirm('Xóa đơn Grab này?'))return;
const g=(state.grabOrders||[]).find(x=>(x.syncId||`${x.time}_${x.date}`)===String(ref));
if(g){
    // Also cancel the corresponding invoice
    const inv=state.todayInvoices.find(i=>i.method==='grab'&&((g.invoiceSyncId&&i.syncId===g.invoiceSyncId)||(g.syncId&&i.sourceGrabSyncId===g.syncId)||(!g.syncId&&i.time===g.time&&i.total===g.grabPrice)));
    if(inv){inv.cancelled=true;inv._lastModified=Date.now();}
    g._deleted=true;g._lastModified=Date.now();
}
archiveDay(today(),state.todayInvoices);
saveState();renderGrabSection();renderTodayInvoices();toast('🗑️ Đã xóa đơn Grab');
}

function renderGrabList(){
const list=document.getElementById('grabList');
const summary=document.getElementById('grabSummary');
const count=document.getElementById('grabCount');
if(!list||!summary)return;
const todayGrabs=activeItems(state.grabOrders||[]).filter(g=>g.date===today());
if(count)count.textContent=todayGrabs.length?`(${todayGrabs.length} đơn)`:'';
if(!todayGrabs.length){list.innerHTML='';summary.style.display='none';return;}
summary.style.display='grid';
const totalGross=todayGrabs.reduce((s,g)=>s+g.grabPrice,0);
const totalNet=todayGrabs.reduce((s,g)=>s+g.netAmount,0);
// Calculate ingredient cost for all grab orders
let ingCost=0;
todayGrabs.forEach(g=>{
    (g.items||[]).forEach(item=>{
        const mi=activeItems(state.menu).find(m=>m.name===item.name||m.id===item.menuId);
        if(!mi)return;
        const recipe=state.recipes[mi.id]||[];
        recipe.forEach(r=>{
            const ing=activeItems(state.ingredients).find(i=>i.id===r.ingId);
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
list.innerHTML=todayGrabs.map(g=>{
    const items=g.items.map(i=>`${i.name}×${i.qty}`).join(', ');
    return `<div class="grab-item"><span class="gi-items">${esc(items)}</span><span class="gi-prices"><span class="gi-menu">${fmtP(g.menuTotal)}</span><span class="gi-grab">${fmtP(g.grabPrice)}</span><span class="gi-net">→${fmtP(g.netAmount)}</span></span><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:0.7rem;margin-left:8px;" onclick="deleteGrabOrder('${jsString(g.syncId||`${g.time}_${g.date}`)}')">✕</button></div>`;
}).join('');
}


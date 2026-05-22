
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
    const purchases=activeItems((state.purchases||{})[dt]||[]);
    document.getElementById('purchaseList').innerHTML=purchases.length?purchases.map(p=>`<div class="setting-item"><span class="si-name">${esc(p.name||'?')}</span><span style="font-size:0.72rem;color:var(--text-muted);">${p.qty}×${p.sln}=${p.totalQty} ${p.unit||''}</span><span class="si-price">${fmtP(p.totalCost)}</span><span style="font-size:0.72rem;color:var(--accent-warm);">${fmtP(p.unitPrice)}/${p.unit||''}</span><button onclick="deletePurchase('${dt}','${jsString(itemRef(p))}')" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button></div>`).join(''):'<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
    document.getElementById('purchaseTotal').textContent=purchases.reduce((s,p)=>s+p.totalCost,0)?'Tổng nhập NL: '+fmtP(purchases.reduce((s,p)=>s+p.totalCost,0)):'';
    const expenses=activeItems((state.expenses||{})[dt]||[]);
    document.getElementById('expenseList').innerHTML=expenses.length?expenses.map(e=>`<div class="setting-item"><span class="si-name">${esc(e.name)}</span><span class="si-price">${fmtP(e.amount)}</span><button onclick="deleteExpense('${dt}','${jsString(itemRef(e))}')" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button></div>`).join(''):'<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
    document.getElementById('expenseTotal').textContent=expenses.reduce((s,e)=>s+e.amount,0)?'Tổng chi phí khác: '+fmtP(expenses.reduce((s,e)=>s+e.amount,0)):'';
    // Xuất kho thủ công (giữ nguyên)
    const reasonIcons={used:'🔧',spoiled:'🗑️',loss:'📉',other:'📌'};
    const reasonLabels={used:'Sử dụng',spoiled:'Hư/Hết hạn',loss:'Hao hụt',other:'Khác'};
    const stockOuts=activeItems((state.manualUsage||{})[dt]||[]);
    const soEl=document.getElementById('stockOutList');
    if(soEl){
        soEl.innerHTML=stockOuts.length?stockOuts.map(s=>`<div class="setting-item"><span class="si-name">${s.autoStockOut?'⏱️':(reasonIcons[s.reason]||'📤')} ${esc(s.name)}</span><span style="font-size:0.72rem;color:var(--text-muted);">${s.qty} ${s.unit||''}</span><span style="font-size:0.72rem;color:var(--accent-red);">${s.autoStockOut?'Định kỳ':(reasonLabels[s.reason]||s.reason)}</span><span style="font-size:0.68rem;color:var(--text-muted);">${s.time||''}</span><button onclick="deleteStockOut('${dt}','${jsString(itemRef(s))}')" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button></div>`).join(''):'<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
    }
    const soTotal=document.getElementById('stockOutTotal');
    if(soTotal)soTotal.textContent=stockOuts.length?`Tổng xuất: ${stockOuts.length} mục`:'';
    renderRecurringStockOuts(dt);
    // Render prep waste tracking (tính năng riêng)
    renderPrepTracking(dt);
    renderNotes();
}
function filterPurchaseIng(){
    const q=(document.getElementById('purchaseIngSearch').value||'').toLowerCase();
    const dd=document.getElementById('purchaseIngDropdown');
    const list=activeItems(state.ingredients).filter(i=>!q||searchMatch(i.name,q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,15);
    if(!list.length||!q){dd.style.display='none';return;}
    dd.style.display='block';
    dd.innerHTML=list.map(i=>`<div style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid rgba(255,255,255,0.04);" onmousedown="selectPurchaseIng(${i.id})" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">${esc(i.name)} <span style="color:var(--text-muted);font-size:0.72rem;">(${i.unit}, SLN:${i.sln||1})</span></div>`).join('');
}
function selectPurchaseIng(id){
    const ing=activeItems(state.ingredients).find(i=>i.id===id);if(!ing)return;
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
    const ing=activeItems(state.ingredients).find(i=>i.id===ingId);if(!ing){toast('⚠️ Chọn nguyên liệu từ danh sách');return;}
    const sln=parseFloat(document.getElementById('purchaseSLN').value)||0;
    const sl=parseFloat(document.getElementById('purchaseSL').value)||0;
    const cost=(parseFloat(document.getElementById('purchaseCost').value)||0)*1000;
    if(!sln||!sl||!cost){toast('⚠️ Nhập đủ SLN, SL, Tổng tiền');return;}
    const totalQty=sl*sln,unitPrice=Math.round(cost/totalQty);
    const dt=getExpenseDate();if(!state.purchases)state.purchases={};if(!state.purchases[dt])state.purchases[dt]=[];
    state.purchases[dt].push({id:state.nextPurchaseId++,syncId:makeSyncId('purchase'),_lastModified:Date.now(),ingId,name:ing.name,unit:ing.unit,totalCost:cost,qty:sl,sln,totalQty,unitPrice,time:nowTime()});
    // Tính giá trung bình 3 lần nhập gần nhất cho nguyên liệu này
    const allPurchases=Object.entries(state.purchases)
        .sort((a,b)=>a[0]<b[0]?1:-1) // sort ngày mới nhất trước
        .flatMap(([,ps])=>activeItems(ps))
        .filter(p=>p.ingId===ingId && p.unitPrice>0);
    const last3=allPurchases.slice(0,3);
    const avgPrice=last3.length>0?Math.round(last3.reduce((s,p)=>s+p.unitPrice,0)/last3.length):unitPrice;
    ing.unitPrice=avgPrice;ing.sln=sln;ing._lastModified=Date.now();
    document.getElementById('purchaseIngSearch').value='';document.getElementById('purchaseIngId').value='';
    document.getElementById('purchaseSLN').value='';document.getElementById('purchaseSL').value='';document.getElementById('purchaseCost').value='';
    document.getElementById('purchasePreview').style.display='none';
    const noteAvg=last3.length>1?` (TB ${last3.length} lần: ${fmtP(avgPrice)}/${ing.unit})`:'';
    saveState();renderExpenseTab();toast(`✅ Nhập ${ing.name}: ${fmtP(unitPrice)}/${ing.unit}${noteAvg}`);
}
function deletePurchase(dt,ref){confirmAction('Xóa mục nhập NL này?',()=>{const p=findByRef((state.purchases||{})[dt]||[],ref);if(p){p._deleted=true;p._lastModified=Date.now();}saveState();renderExpenseTab();});}
function addExpense(){
    const name=document.getElementById('expenseName').value.trim();
    const amount=(parseFloat(document.getElementById('expenseAmount').value)||0)*1000;
    if(!name||!amount){toast('⚠️ Nhập tên và số tiền');return;}
    const dt=getExpenseDate();if(!state.expenses)state.expenses={};if(!state.expenses[dt])state.expenses[dt]=[];
    state.expenses[dt].push({id:state.nextExpenseId++,syncId:makeSyncId('expense'),_lastModified:Date.now(),name,amount,time:nowTime()});
    document.getElementById('expenseName').value='';document.getElementById('expenseAmount').value='';
    saveState();renderExpenseTab();toast(`✅ ${name}: ${fmtP(amount)}`);
}
function deleteExpense(dt,ref){confirmAction('Xóa khoản chi này?',()=>{const e=findByRef((state.expenses||{})[dt]||[],ref);if(e){e._deleted=true;e._lastModified=Date.now();}saveState();renderExpenseTab();});}

// ═══════════════════════════════════════
// XUẤT KHO THỦ CÔNG
// ═══════════════════════════════════════
function filterStockOutIng(){
    const q=(document.getElementById('stockOutIngSearch').value||'').toLowerCase();
    const dd=document.getElementById('stockOutIngDropdown');
    const list=activeItems(state.ingredients).filter(i=>!q||searchMatch(i.name,q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,15);
    if(!list.length||!q){dd.style.display='none';return;}
    dd.style.display='block';
    dd.innerHTML=list.map(i=>`<div style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid rgba(255,255,255,0.04);" onmousedown="selectStockOutIng(${i.id})" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">${esc(i.name)} <span style="color:var(--text-muted);font-size:0.72rem;">(${i.unit})</span></div>`).join('');
}
function selectStockOutIng(id){
    const ing=activeItems(state.ingredients).find(i=>i.id===id);if(!ing)return;
    document.getElementById('stockOutIngSearch').value=ing.name;
    document.getElementById('stockOutIngId').value=id;
    document.getElementById('stockOutIngDropdown').style.display='none';
    document.getElementById('stockOutQty').focus();
}
document.addEventListener('click',e=>{const dd=document.getElementById('stockOutIngDropdown');if(dd&&!e.target.closest('#stockOutIngSearch')&&!e.target.closest('#stockOutIngDropdown'))dd.style.display='none';});
document.addEventListener('click',e=>{const dd=document.getElementById('recStockOutIngDropdown');if(dd&&!e.target.closest('#recStockOutIngSearch')&&!e.target.closest('#recStockOutIngDropdown'))dd.style.display='none';});

function addStockOut(){
    const ingId=parseInt(document.getElementById('stockOutIngId').value);
    const ing=activeItems(state.ingredients).find(i=>i.id===ingId);
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
        id:state.nextStockOutId++, syncId:makeSyncId('stockout'), _lastModified:Date.now(), ingId, name:ing.name, unit:ing.unit,
        qty, reason, time:nowTime()
    });
    document.getElementById('stockOutIngSearch').value='';
    document.getElementById('stockOutIngId').value='';
    document.getElementById('stockOutQty').value='';
    saveState();renderExpenseTab();renderInventory();
    toast(`📤 Xuất ${qty} ${ing.unit} ${ing.name} — ${reasonLabels[reason]}`);
}
function deleteStockOut(dt,ref){
    confirmAction('Xóa mục xuất kho này?',()=>{
        const s=findByRef((state.manualUsage||{})[dt]||[],ref);if(s){s._deleted=true;s._lastModified=Date.now();}
        saveState();renderExpenseTab();renderInventory();
    });
}

let recurringStockOutTimerStarted=false;
function recurringStockOutItems(){return activeItems(state.recurringStockOuts||[]).sort((a,b)=>(a.time||'').localeCompare(b.time||'')||String(a.name||'').localeCompare(String(b.name||'')));}
function recurringStockOutKey(dt,s){return `auto-stockout:${dt}:${s.syncId||s.id}`;}
function isWeekendDate(dt){const d=new Date(dt+'T12:00:00');const day=d.getDay();return day===0||day===6;}
function recurringStockOutQty(s,dt){return Number(isWeekendDate(dt)?s.weekendQty:s.weekdayQty)||0;}
function hasRecurringStockOutRun(dt,s){
    const key=recurringStockOutKey(dt,s);
    return ((state.manualUsage||{})[dt]||[]).some(x=>x&&x.syncId===key);
}
function recurringTimeReached(dt,time){
    if(dt!==today())return false;
    const [h,m]=String(time||'15:00').split(':').map(Number);
    const now=new Date();
    return now.getHours()*60+now.getMinutes() >= (h||0)*60+(m||0);
}
function filterRecStockOutIng(){
    const q=(document.getElementById('recStockOutIngSearch')?.value||'').toLowerCase();
    const dd=document.getElementById('recStockOutIngDropdown');
    if(!dd)return;
    const list=activeItems(state.ingredients).filter(i=>!q||searchMatch(i.name,q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,15);
    if(!list.length||!q){dd.style.display='none';return;}
    dd.style.display='block';
    dd.innerHTML=list.map(i=>`<div style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid rgba(255,255,255,0.04);" onmousedown="selectRecStockOutIng(${i.id})" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">${esc(i.name)} <span style="color:var(--text-muted);font-size:0.72rem;">(${i.unit})</span></div>`).join('');
}
function selectRecStockOutIng(id){
    const ing=activeItems(state.ingredients).find(i=>i.id===id);if(!ing)return;
    document.getElementById('recStockOutIngSearch').value=ing.name;
    document.getElementById('recStockOutIngId').value=id;
    document.getElementById('recStockOutIngDropdown').style.display='none';
    document.getElementById('recStockOutWeekdayQty').focus();
}
function addRecurringStockOut(){
    const ingId=parseInt(document.getElementById('recStockOutIngId')?.value);
    const ing=activeItems(state.ingredients).find(i=>i.id===ingId);
    if(!ing){toast('⚠️ Chọn nguyên liệu cho lịch');return;}
    const time=(document.getElementById('recStockOutTime')?.value||'15:00').trim();
    const weekdayQty=parseFloat(document.getElementById('recStockOutWeekdayQty')?.value)||0;
    const weekendQty=parseFloat(document.getElementById('recStockOutWeekendQty')?.value)||0;
    if(!weekdayQty&&!weekendQty){toast('⚠️ Nhập số lượng ngày thường hoặc cuối tuần');return;}
    if(!state.recurringStockOuts)state.recurringStockOuts=[];
    if(!state.nextRecurringStockOutId)state.nextRecurringStockOutId=1;
    const existing=activeItems(state.recurringStockOuts).find(s=>s.ingId===ingId&&s.time===time);
    if(existing){
        existing.weekdayQty=weekdayQty;existing.weekendQty=weekendQty;existing.enabled=true;existing.name=ing.name;existing.unit=ing.unit;existing._lastModified=Date.now();
        toast(`✅ Đã cập nhật lịch ${ing.name}`);
    }else{
        state.recurringStockOuts.push({id:state.nextRecurringStockOutId++,syncId:makeSyncId('rec-stockout'),_lastModified:Date.now(),enabled:true,ingId,name:ing.name,unit:ing.unit,time,weekdayQty,weekendQty,reason:'used'});
        toast(`✅ Đã thêm lịch ${time} cho ${ing.name}`);
    }
    document.getElementById('recStockOutIngSearch').value='';
    document.getElementById('recStockOutIngId').value='';
    saveState();renderRecurringStockOuts(getExpenseDate());
}
function toggleRecurringStockOut(ref){
    const s=findByRef(state.recurringStockOuts||[],ref);if(!s)return;
    s.enabled=!s.enabled;s._lastModified=Date.now();
    saveState();renderRecurringStockOuts(getExpenseDate());
}
function deleteRecurringStockOut(ref){
    confirmAction('Xóa lịch xuất kho định kỳ này?',()=>{
        const s=findByRef(state.recurringStockOuts||[],ref);if(s){s._deleted=true;s._lastModified=Date.now();}
        saveState();renderRecurringStockOuts(getExpenseDate());
    });
}
function renderRecurringStockOuts(dt){
    const el=document.getElementById('recStockOutList');if(!el)return;
    const schedules=recurringStockOutItems();
    if(!schedules.length){el.innerHTML='<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:0.78rem;">Chưa có lịch định kỳ</div>';return;}
    el.innerHTML=schedules.map(s=>{
        const qty=recurringStockOutQty(s,dt),done=hasRecurringStockOutRun(dt,s),enabled=s.enabled!==false;
        return `<div class="setting-item" style="gap:6px;flex-wrap:wrap;">
            <span class="si-name" style="min-width:130px;">⏱️ ${esc(s.name)}</span>
            <span style="font-size:0.72rem;color:var(--text-muted);">${s.time||'15:00'} · T2-T6: ${s.weekdayQty||0}${s.unit||''} · T7-CN: ${s.weekendQty||0}${s.unit||''}</span>
            <span style="font-size:0.72rem;color:${done?'var(--accent-green)':'var(--text-muted)'};">${done?'Đã chạy hôm nay':`Hôm nay: ${qty}${s.unit||''}`}</span>
            <button onclick="toggleRecurringStockOut('${jsString(itemRef(s))}')" style="font-size:0.7rem;background:none;border:none;cursor:pointer;color:${enabled?'var(--accent-green)':'var(--text-muted)'};">${enabled?'Bật':'Tắt'}</button>
            <button onclick="deleteRecurringStockOut('${jsString(itemRef(s))}')" style="font-size:0.7rem;background:none;border:none;cursor:pointer;">🗑️</button>
        </div>`;
    }).join('');
}
function runRecurringStockOutsForDate(dt,force){
    if(!state.manualUsage)state.manualUsage={};
    if(!state.manualUsage[dt])state.manualUsage[dt]=[];
    let added=0;
    recurringStockOutItems().forEach(s=>{
        if(s.enabled===false)return;
        if(!force&&!recurringTimeReached(dt,s.time))return;
        if(hasRecurringStockOutRun(dt,s))return;
        const ing=activeItems(state.ingredients).find(i=>i.id===s.ingId);
        if(!ing)return;
        const qty=recurringStockOutQty(s,dt);
        if(qty<=0)return;
        if(!state.nextStockOutId)state.nextStockOutId=1;
        state.manualUsage[dt].push({
            id:state.nextStockOutId++,syncId:recurringStockOutKey(dt,s),_lastModified:Date.now(),autoStockOut:true,
            recurringId:s.syncId||s.id,ingId:ing.id,name:ing.name,unit:ing.unit,qty,reason:s.reason||'used',time:s.time||nowTime()
        });
        added++;
    });
    if(added){
        saveState();renderExpenseTab();renderInventory();
        toast(`⏱️ Đã tự xuất kho ${added} mục định kỳ`);
    }else if(force){
        toast('ℹ️ Không có lịch nào cần chạy hoặc đã chạy rồi');
    }
    return added;
}
function checkRecurringStockOuts(){runRecurringStockOutsForDate(today(),false);}
function startRecurringStockOutTimer(){
    if(recurringStockOutTimerStarted)return;
    recurringStockOutTimerStarted=true;
    setInterval(checkRecurringStockOuts,60000);
}

// ═══════════════════════════════════════
// THEO DÕI HAO HỤT (Prep Waste Tracking)
// ═══════════════════════════════════════
function filterPrepIng(){
    const q=(document.getElementById('prepIngSearch').value||'').toLowerCase();
    const dd=document.getElementById('prepIngDropdown');
    const list=activeItems(state.ingredients).filter(i=>!q||searchMatch(i.name,q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,15);
    if(!list.length||!q){dd.style.display='none';return;}
    dd.style.display='block';
    dd.innerHTML=list.map(i=>`<div style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid rgba(255,255,255,0.04);" onmousedown="selectPrepIng(${i.id})" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">${esc(i.name)} <span style="color:var(--text-muted);font-size:0.72rem;">(${i.unit})</span></div>`).join('');
}
function selectPrepIng(id){
    const ing=activeItems(state.ingredients).find(i=>i.id===id);if(!ing)return;
    document.getElementById('prepIngSearch').value=ing.name;
    document.getElementById('prepIngId').value=id;
    document.getElementById('prepIngDropdown').style.display='none';
    document.getElementById('prepQty').focus();
}
document.addEventListener('click',e=>{const dd=document.getElementById('prepIngDropdown');if(dd&&!e.target.closest('#prepIngSearch')&&!e.target.closest('#prepIngDropdown'))dd.style.display='none';});

function addPrepTracking(){
    const ingId=parseInt(document.getElementById('prepIngId').value);
    const ing=activeItems(state.ingredients).find(i=>i.id===ingId);
    if(!ing){toast('⚠️ Chọn nguyên liệu');return;}
    const qty=parseFloat(document.getElementById('prepQty').value)||0;
    if(!qty){toast('⚠️ Nhập số lượng');return;}
    const dt=getExpenseDate();
    if(!state.prepTracking)state.prepTracking={};
    if(!state.prepTracking[dt])state.prepTracking[dt]=[];
    if(!state.nextPrepId)state.nextPrepId=1;
    state.prepTracking[dt].push({
        id:state.nextPrepId++, syncId:makeSyncId('prep'), _lastModified:Date.now(), ingId, name:ing.name, unit:ing.unit,
        qty, unitPrice:ing.unitPrice, time:nowTime()
    });
    document.getElementById('prepIngSearch').value='';
    document.getElementById('prepIngId').value='';
    document.getElementById('prepQty').value='';
    saveState();renderExpenseTab();renderInventory();
    toast(`📊 Ghi chuẩn bị ${qty} ${ing.unit} ${ing.name}`);
}
function deletePrepTracking(dt,ref){
    const s=findByRef((state.prepTracking||{})[dt]||[],ref);if(s){s._deleted=true;s._lastModified=Date.now();}
    // Xóa auto expense nếu có
    syncPrepWasteExpense(dt);
    saveState();renderExpenseTab();renderInventory();
}

function renderPrepTracking(dt){
    const el=document.getElementById('prepTrackingList');
    const totalEl=document.getElementById('prepWasteTotal');
    if(!el)return;
    const preps=activeItems((state.prepTracking||{})[dt]||[]);
    if(!preps.length){
        el.innerHTML='<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">Chưa có</div>';
        if(totalEl)totalEl.textContent='';
        return;
    }
    const todayUsage=calcDailyUsage(dt);
    // Gộp các entry cùng nguyên liệu
    const grouped={};
    preps.forEach(p=>{
        if(!grouped[p.ingId])grouped[p.ingId]={ingId:p.ingId,name:p.name,unit:p.unit,totalPrep:0,unitPrice:p.unitPrice||0,ids:[]};
        grouped[p.ingId].totalPrep+=p.qty;
        grouped[p.ingId].ids.push(p.id);
    });
    let totalWasteCost=0;
    let html=Object.values(grouped).map(g=>{
        const recipeSold=Math.round((todayUsage[g.ingId]||0)*100)/100;
        const waste=Math.max(0,Math.round((g.totalPrep-recipeSold)*100)/100);
        const wasteCost=Math.round(waste*g.unitPrice);
        totalWasteCost+=wasteCost;
        const pct=g.totalPrep>0?Math.round(waste/g.totalPrep*100):0;
        const statusColor=waste>0?'var(--accent-red)':'var(--accent-green)';
        const statusText=waste>0?`🗑️ Bỏ: ${waste} ${g.unit} (${pct}%) ≈ ${fmtP(wasteCost)}`:'✅ Dùng hết';
        return `<div class="setting-item" style="flex-wrap:wrap;gap:4px;padding:8px 10px;">
            <span class="si-name" style="min-width:120px;">📊 ${esc(g.name)}</span>
            <span style="font-size:0.72rem;color:var(--accent-warm);font-weight:600;">CB: ${g.totalPrep} ${g.unit}</span>
            <span style="font-size:0.72rem;color:var(--accent-green);">Bán: ${recipeSold} ${g.unit}</span>
            <span style="font-size:0.72rem;font-weight:700;color:${statusColor};">${statusText}</span>
        </div>`;
    }).join('');
    // Hiện từng entry riêng để xóa
    html+=preps.map(p=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;font-size:0.72rem;color:var(--text-muted);">
        <span style="flex:1;">↳ ${p.time}: ${p.qty} ${p.unit} ${esc(p.name)}</span>
        <button onclick="deletePrepTracking('${dt}','${jsString(itemRef(p))}')" style="font-size:0.8rem;background:none;border:none;cursor:pointer;color:var(--accent-red);padding:2px 6px;">🗑</button>
    </div>`).join('');
    el.innerHTML=html;
    if(totalEl)totalEl.textContent=totalWasteCost>0?`Tổng hao hụt: ${fmtP(totalWasteCost)}`:'';
    // Auto-sync waste cost to expenses
    syncPrepWasteExpense(dt,totalWasteCost);
}

function syncPrepWasteExpense(dt,totalWasteCost){
    if(typeof totalWasteCost==='undefined'){
        // Recalculate
        const preps=activeItems((state.prepTracking||{})[dt]||[]);
        const todayUsage=calcDailyUsage(dt);
        totalWasteCost=0;
        const grouped={};
        preps.forEach(p=>{
            if(!grouped[p.ingId])grouped[p.ingId]={totalPrep:0,unitPrice:p.unitPrice||0};
            grouped[p.ingId].totalPrep+=p.qty;
        });
        Object.entries(grouped).forEach(([ingId,g])=>{
            const recipeSold=todayUsage[parseInt(ingId)]||0;
            const waste=Math.max(0,g.totalPrep-recipeSold);
            totalWasteCost+=Math.round(waste*g.unitPrice);
        });
    }
    if(!state.expenses)state.expenses={};
    if(!state.expenses[dt])state.expenses[dt]=[];
    const existIdx=state.expenses[dt].findIndex(e=>e.isAutoWaste);
    if(totalWasteCost>0){
        if(existIdx>=0){
            state.expenses[dt][existIdx].amount=totalWasteCost;
            state.expenses[dt][existIdx]._deleted=false;
            state.expenses[dt][existIdx]._lastModified=Date.now();
        }else{
            state.expenses[dt].push({id:state.nextExpenseId++,syncId:makeSyncId('expense'),_lastModified:Date.now(),name:'🗑️ Hao hụt NL (tự động)',amount:totalWasteCost,time:'auto',isAutoWaste:true});
        }
    }else{
        if(existIdx>=0){state.expenses[dt][existIdx]._deleted=true;state.expenses[dt][existIdx]._lastModified=Date.now();}
    }
}

// Tính tổng prep waste cho nguyên liệu (dùng trong getStockInfo)
function calcTotalPrepWaste(ingId){
    let totalWaste=0;
    Object.entries(state.prepTracking||{}).forEach(([date,entries])=>{
        let prepForIng=0;
        activeItems(entries).forEach(e=>{if(e.ingId===ingId)prepForIng+=e.qty;});
        if(prepForIng>0){
            const dailyUsage=calcDailyUsage(date);
            const recipeSold=dailyUsage[ingId]||0;
            totalWaste+=Math.max(0,prepForIng-recipeSold);
        }
    });
    return Math.round(totalWaste*100)/100;
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

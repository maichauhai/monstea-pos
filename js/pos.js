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
    const dup=activeItems(state.staff).find(s=>s.password===np);
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
    let items=activeItems(state.menu).filter(m=>m.active&&!m.isGuide&&(posCategory==='Tất cả'||m.category===posCategory));
    // Build global numbering (across all active items)
    const allActive=activeItems(state.menu).filter(m=>m.active&&!m.isGuide);
    const numMap={};allActive.forEach((m,idx)=>{numMap[m.id]=idx+1;});
    // Search filter
    if(searchVal){
        const allForSearch=activeItems(state.menu).filter(m=>m.active&&!m.isGuide);
        const isNum=/^\d+$/.test(searchVal);
        items=allForSearch.filter(m=>{
            if(isNum)return String(numMap[m.id])===searchVal;
            return searchMatch(m.name,searchVal);
        });
    }
    g.innerHTML=items.map(m=>{const qty=state.currentOrder.reduce((s,o)=>{if(o.menuId===m.id)s+=o.qty;(o.toppings||[]).forEach(t=>{if(t.menuId===m.id)s+=1;});return s;},0);const vis=getMenuVisual(m);const num=numMap[m.id]||'';return `<div class="menu-item-btn ${qty?'mi-badge-active':''}" style="position:relative;" onclick="addToOrder(${m.id})">${qty?`<span class="mi-badge">${qty}</span>`:''}<span class="mi-number">${num}</span>${vis}<div class="mi-name">${esc(m.name)}</div><div class="mi-price">${fmtP(m.price)}</div></div>`;}).join('')||'<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Không tìm thấy</div>';
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
function addToOrder(id){const m=activeItems(state.menu).find(x=>x.id===id);if(!m)return;
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
function clearOrder(){state.currentOrder=[];document.getElementById('orderNote').value='';document.getElementById('cashGiven').value='';document.getElementById('changeResult').textContent='';document.getElementById('discountInput').value='';document.getElementById('discountDisplay').textContent='';document.getElementById('finalTotalRow').style.display='none';const md=document.getElementById('mobDiscountInput');if(md)md.value='';const mc=document.getElementById('mobCashGiven');if(mc)mc.value='';const mr=document.getElementById('mobChangeResult');if(mr)mr.textContent='';delete state._editingInvoiceId;delete state._editingInvoiceRef;delete state._editingOldSummary;document.getElementById('orderTitle').textContent='HÓA ĐƠN MỚI';document.getElementById('orderTitle').style.color='';renderOrder();renderPOSMenu();}
function renderOrder(){const c=document.getElementById('orderItems'),t=document.getElementById('orderTotal'),n=document.getElementById('orderCount');
if(!state.currentOrder.length){c.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.85rem;">Chọn món từ menu bên trái</div>';t.textContent='0đ';n.textContent='0 món';updateMobileBar();return;}
const tq=state.currentOrder.reduce((s,o)=>s+o.qty,0);
const ta=state.currentOrder.reduce((s,o)=>{const tp=(o.toppings||[]).reduce((st,tt)=>st+tt.price,0);return s+(o.price+tp)*o.qty;},0);
c.innerHTML=state.currentOrder.map((o,idx)=>{
    const tp=o.toppings||[];const tpTotal=tp.reduce((s,tt)=>s+tt.price,0);const lineTotal=(o.price+tpTotal)*o.qty;
    const tpHtml=tp.length?`<div class="oi-toppings">${tp.map((tt,ti)=>`<div class="oi-topping-line">+ ${esc(tt.name)} <span class="oi-topping-remove" onclick="event.stopPropagation();removeTopping(${idx},${ti})">✕</span></div>`).join('')}</div>`:'';
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
const editRef=state._editingInvoiceRef||state._editingInvoiceId;
if(editRef){const inv=findInvoiceByRef(editRef,true),eid=inv?inv.id:editRef;
if(inv){const os=state._editingOldSummary,ns=flatItems.map(i=>{const tp=(i.toppings||[]).map(t=>t.name).join('+');return `${i.name}${tp?' +'+tp:''}×${i.qty}`;}).join(', ')+` = ${fmtP(total)}`;
if(!state.editLog)state.editLog=[];state.editLog.push({syncId:makeSyncId('edit'),_lastModified:Date.now(),invoiceId:eid,invoiceRef:invoiceRef(inv),action:'SỬA ĐƠN',time:`${today()} ${nowTime()}`,before:os,after:ns});
inv.items=[...flatItems];inv.total=total;inv.method=method;inv.note=note;inv.edited=true;inv.discount=discount>0?discount:undefined;inv._lastModified=Date.now();
toast(`✅ Đã cập nhật #${invoiceDisplayId(inv)}`);}
delete state._editingInvoiceId;delete state._editingInvoiceRef;delete state._editingOldSummary;
document.getElementById('orderTitle').textContent='HÓA ĐƠN MỚI';document.getElementById('orderTitle').style.color='';
}else{const ts=Date.now();const inv={id:nextTodayInvoiceId(),syncId:makeSyncId('inv'),createdAt:ts,_lastModified:ts,date:today(),time:nowTime(),hour:nowHour(),items:[...flatItems],total,method,note};
if(discount>0)inv.discount=discount;
if(isStaff)inv.staffOriginalTotal=subtotal;
state.todayInvoices.push(inv);state.nextInvoiceId=nextTodayInvoiceId();toast(isStaff?`🏠 Nội bộ #${invoiceDisplayId(inv)} — ${state.currentOrder.reduce((s,o)=>s+o.qty,0)} món (0đ)`:`✅ Thanh toán #${invoiceDisplayId(inv)} — ${fmtP(total)}${discount>0?' (giảm '+fmtP(discount)+')':''}`);}
playPaySound();vibrate(100);state.currentOrder=[];document.getElementById('orderNote').value='';document.getElementById('cashGiven').value='';document.getElementById('changeResult').textContent='';document.getElementById('discountInput').value='';document.getElementById('discountDisplay').textContent='';document.getElementById('finalTotalRow').style.display='none';const md=document.getElementById('mobDiscountInput');if(md)md.value='';const mc=document.getElementById('mobCashGiven');if(mc)mc.value='';const mr=document.getElementById('mobChangeResult');if(mr)mr.textContent='';archiveDay(today(),state.todayInvoices);renderOrder();renderPOSMenu();renderTodayInvoices();saveState();}

function renderTodayInvoices(){const c=document.getElementById('todayInvoiceList'),ce=document.getElementById('todayInvCount');
const ti=todayInvoicesSorted(),tt=ti.filter(i=>!i.cancelled&&i.method!=='staff').reduce((s,i)=>s+i.total,0),sc=ti.filter(i=>!i.cancelled&&i.method==='staff').length;
ce.textContent=`(${ti.filter(i=>!i.cancelled).length} đơn${sc?' ('+sc+' nội bộ)':''} — ${fmtP(tt)})`;
if(!ti.length){c.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Chưa có hóa đơn</div>';return;}
c.innerHTML=[...ti].reverse().map(inv=>{const is=inv.items.map(i=>{const tp=(i.toppings||[]).map(t=>t.name).join('+');return `${i.name}${tp?' +'+tp:''}×${i.qty}`;}).join(', ');
return `<div class="inv-row ${inv.cancelled?'cancelled':''}" onclick="showInvoiceDetail('${jsString(invoiceRef(inv))}')"><span class="inv-id">#${invoiceDisplayId(inv)}${inv.cancelled?'<span class="inv-badge cancelled-badge">ĐÃ HỦY</span>':''}${inv.edited&&!inv.cancelled?'<span class="inv-badge edited">ĐÃ SỬA</span>':''}${inv.method==='grab'?'<span class="inv-badge" style="background:rgba(96,165,250,0.15);color:var(--accent-blue);">GRAB</span>':''}${inv.method==='staff'?'<span class="inv-badge staff-badge">NỘI BỘ</span>':''}</span><span class="inv-time">${inv.time}</span><span class="inv-items">${esc(is)}</span><span class="inv-method ${inv.method}">${inv.method==='cash'?'💵':inv.method==='grab'?'🏍️':inv.method==='staff'?'🏠':'📱'}</span><span class="inv-total">${inv.cancelled?fmtP(0):fmtP(inv.total)}</span></div>`;}).join('');}

function showInvoiceDetail(ref){const td=today();
const inv=findInvoiceByRef(ref,true);if(!inv)return;
const invRef=invoiceRef(inv);
const logs=(state.editLog||[]).filter(l=>(l.invoiceRef===invRef||(!l.invoiceRef&&l.invoiceId===inv.id))&&l.time&&l.time.startsWith(td));
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
${!inv.cancelled?`<div style="display:flex;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);"><button class="btn btn-primary btn-sm" onclick="editInvoice('${jsString(invRef)}')" style="flex:1;">✏️ Sửa đơn</button><button class="btn btn-danger btn-sm" onclick="cancelInvoice('${jsString(invRef)}')" style="flex:1;">🚫 Hủy đơn</button></div>`:''}`;
openModal('Hóa đơn #'+invoiceDisplayId(inv),body);}

function editInvoice(ref){const inv=findInvoiceByRef(ref);if(!inv||inv.cancelled)return;const id=inv.id;closeModal();
state.currentOrder=inv.items.map(i=>({...i}));state._editingInvoiceId=inv.id;state._editingInvoiceRef=invoiceRef(inv);state._editingOldSummary=inv.items.map(i=>`${i.name}×${i.qty}`).join(', ')+` = ${fmtP(inv.total)}`;
document.getElementById('orderTitle').textContent=`✏️ SỬA #${invoiceDisplayId(inv)}`;document.getElementById('orderTitle').style.color='var(--accent)';
document.getElementById('orderNote').value=inv.note||'';renderOrder();toast(`✏️ Đang sửa #${invoiceDisplayId(inv)}`);}

function cancelInvoice(ref){const td=today();
// Find the actual invoice object in the array (not a copy) using index
const idx=findInvoiceIndexByRef(ref);
if(idx===-1){toast('⚠️ Không tìm thấy đơn hôm nay hoặc đã hủy rồi');return;}
const inv=state.todayInvoices[idx];
const id=inv.id,invRef=invoiceRef(inv);
confirmAction(`Hủy đơn #${invoiceDisplayId(inv)}?`,()=>{
inv.cancelled=true;inv._lastModified=Date.now();if(!state.editLog)state.editLog=[];
state.editLog.push({syncId:makeSyncId('edit'),_lastModified:Date.now(),invoiceId:id,invoiceRef:invRef,action:'HỦY ĐƠN',time:`${today()} ${nowTime()}`,before:inv.items.map(i=>`${i.name}×${i.qty}`).join(', ')+` = ${fmtP(inv.total)}`,after:'Đã hủy'});
archiveDay(today(),state.todayInvoices);saveState();renderTodayInvoices();closeModal();toast(`🚫 Đã hủy #${invoiceDisplayId(inv)}`);}, 'Hủy đơn');}

function showEditLog(){const td=today();const logs=(state.editLog||[]).filter(l=>l.time&&l.time.startsWith(td));if(!logs.length){openModal('📝 Nhật ký','<div style="text-align:center;padding:20px;color:var(--text-muted);">Hôm nay chưa có thay đổi</div>');return;}
openModal(`📝 Nhật ký hôm nay (${logs.length})`,[...logs].reverse().map(l=>`<div class="edit-log-item"><div class="log-time">🕒 ${l.time} — #${invoiceLogDisplayId(l)} — <strong>${l.action}</strong></div><div class="log-detail">${l.before?`<div class="log-before">❌ ${esc(l.before)}</div>`:''}${l.after?`<div class="log-after">✅ ${esc(l.after)}</div>`:''}</div></div>`).join(''));}


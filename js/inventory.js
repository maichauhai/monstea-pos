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
    // Tính hao hụt từ prep tracking (phần chuẩn bị nhưng không bán được)
    const prepWaste=calcTotalPrepWaste(ing.id);
    const openStock=ing.openStock||0;
    const stock=Math.round((openStock+purchased-totalUsed-manualUsed-prepWaste)*100)/100;
    const warn=ing.warnLevel||0;
    const avgDaily=Math.round(calcAvgDailyUsage(ing.id)*10)/10;
    const daysLeft=avgDaily>0?Math.round(stock/avgDaily*10)/10:999;
    let status='ok';
    if(warn>0&&stock<=warn)status='danger';
    else if(warn>0&&stock<=warn*2)status='warning';
    else if(daysLeft<=2&&avgDaily>0)status='danger';
    else if(daysLeft<=5&&avgDaily>0)status='warning';
    return{stock,purchased,totalUsed:Math.round((totalUsed+manualUsed+prepWaste)*100)/100,avgDaily,daysLeft,status};
}
function renderInventory(){
    const search=(document.getElementById('ingSearch')?.value||'').toLowerCase();
    const list=state.ingredients.filter(i=>!search||searchMatch(i.name,search));
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
function deleteIngredient(id){confirmAction('Xóa NL này?',()=>{state.ingredients=state.ingredients.filter(i=>i.id!==id);saveState();renderInventory();toast('🗑️ Đã xóa');});}
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

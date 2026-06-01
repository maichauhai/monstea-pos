// ═══════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════
function renderSettings(){
    document.getElementById('menuList').innerHTML=activeItems(state.menu).map(m=>`<div class="setting-item" style="${m.active?'':'opacity:0.4'}">
<select onchange="changeMenuCat(${m.id},this.value)" style="width:auto;min-width:80px;padding:4px 8px;font-size:0.72rem;flex:0;">${state.categories.map(c=>`<option value="${c}" ${c===m.category?'selected':''}>${c}</option>`).join('')}</select>
<span class="si-name">${m.isGuide?'📖 ':''}${esc(m.name)}</span><span class="si-price">${m.isGuide?'(HD)':fmtP(m.price)}</span>
<div class="si-actions"><button onclick="editMenuItem(${m.id})" title="Sửa món">✏️</button><button onclick="toggleMenuItem(${m.id})" title="${m.active?'Ẩn':'Hiện'}">${m.active?'👁️':'🚫'}</button><button onclick="deleteMenuItem(${m.id})" title="Xóa">🗑️</button></div></div>`).join('');
    document.getElementById('newMenuCat').innerHTML=state.categories.map(c=>`<option value="${c}">${c}</option>`).join('');
    document.getElementById('staffList').innerHTML=activeItems(state.staff).map(s=>`<div class="setting-item"><span class="si-name">${esc(s.name)}</span><span style="font-size:0.7rem;color:var(--accent);margin-left:auto;margin-right:8px;">💰${fmtP(s.wageRate||25000)}/h</span><span style="font-size:0.65rem;color:var(--text-muted);margin-right:8px;">🔑****</span><div class="si-actions"><button onclick="editStaff(${s.id})" title="Sửa">✏️</button><button onclick="deleteStaff(${s.id})">🗑️</button></div></div>`).join('');
    ['open','close'].forEach(t=>{const l=activeItems(t==='open'?state.openChecklist:state.closeChecklist);
    document.getElementById(t+'ClSettings').innerHTML=l.map(c=>`<div class="setting-item"><span class="si-name">${esc(c.text)}</span><div class="si-actions"><button onclick="deleteChecklistItem('${t}',${c.id})">🗑️</button></div></div>`).join('');});
}

function changeMenuCat(id,cat){const m=state.menu.find(x=>x.id===id);if(!m)return;m.category=cat;m._lastModified=Date.now();saveState();renderPOSMenu();toast(`✅ ${m.name} → ${cat}`);}

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
m.name=n;m.price=p;m.category=c;m._lastModified=Date.now();saveState();renderSettings();renderPOSMenu();renderRecipes();closeModal();toast(`✅ Đã cập nhật "${n}"`);}

function addMenuItem(){const n=document.getElementById('newMenuName').value.trim(),p=parseInt(document.getElementById('newMenuPrice').value),c=document.getElementById('newMenuCat').value;if(!n||!p){toast('⚠️ Nhập tên và giá');return;}state.menu.push({id:state.nextMenuId++,name:n,price:p,category:c,active:true,_lastModified:Date.now()});document.getElementById('newMenuName').value='';document.getElementById('newMenuPrice').value='';saveState();renderSettings();renderPOSMenu();toast(`✅ Đã thêm "${n}"`);}
function addCategory(){const n=document.getElementById('newCatName').value.trim();if(!n)return;if(state.categories.includes(n)){toast('⚠️ Đã tồn tại');return;}state.categories.push(n);document.getElementById('newCatName').value='';saveState();renderSettings();renderPOSMenu();toast(`✅ Đã thêm "${n}"`);}
function toggleMenuItem(id){const m=state.menu.find(x=>x.id===id);if(m){m.active=!m.active;m._lastModified=Date.now();}saveState();renderSettings();renderPOSMenu();}
function deleteMenuItem(id){if(!confirm('Xóa món này khỏi menu?'))return;const m=state.menu.find(x=>x.id===id);if(m){m._deleted=true;m.active=false;m._lastModified=Date.now();}saveState();renderSettings();renderPOSMenu();toast('🗑️ Đã xóa');}
function addStaff(){const n=document.getElementById('newStaffName').value.trim();if(!n)return;const pwd=String(state.nextStaffId)+'000';state.staff.push({id:state.nextStaffId++,name:n,password:pwd,wageRate:25000,_lastModified:Date.now()});document.getElementById('newStaffName').value='';saveState();renderSettings();renderAttendance();toast(`✅ Đã thêm "${n}" (pass: ${pwd})`);}
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
const dup=activeItems(state.staff).find(x=>x.id!==id&&x.password===p);
if(dup){toast(`⚠️ Pass "${p}" đã dùng cho ${dup.name}`);return;}
if(APP_PASSWORDS[p]){toast('⚠️ Pass trùng với chủ quán');return;}
s.name=n;s.password=p;s.wageRate=w;s._lastModified=Date.now();saveState();renderSettings();renderAttendance();closeModal();toast(`✅ Đã cập nhật ${n}`);}
function deleteStaff(id){const s=state.staff.find(x=>x.id===id);if(s){s._deleted=true;s._lastModified=Date.now();}saveState();renderSettings();renderAttendance();toast('🗑️ Đã xóa');}
function addChecklistItem(t){const iid=t==='open'?'newOpenCl':'newCloseCl';const txt=document.getElementById(iid).value.trim();if(!txt)return;(t==='open'?state.openChecklist:state.closeChecklist).push({id:state.nextClId++,text:txt,checked:false,_lastModified:Date.now()});document.getElementById(iid).value='';saveState();renderSettings();renderChecklist();toast('✅ Đã thêm');}
function deleteChecklistItem(t,id){const l=t==='open'?state.openChecklist:state.closeChecklist;const item=l.find(c=>c.id===id);if(item){item._deleted=true;item._lastModified=Date.now();}saveState();renderSettings();renderChecklist();}


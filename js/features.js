// ═══════════════════════════════════════
// EXPORT & BACKUP
// ═══════════════════════════════════════
function exportCSV(){const d=getDashData();let csv='Tên món,Số lượng,Doanh thu\n';Object.entries(d.itemsSold).sort((a,b)=>b[1].qty-a[1].qty).forEach(([n,x])=>{csv+=`"${n}",${x.qty},${x.revenue}\n`;});csv+=`\nTổng doanh thu,,${d.totalRevenue}\nTổng hóa đơn,,${d.totalInvoices}\nTiền mặt,,${d.cashTotal}\nChuyển khoản,,${d.transferTotal}\n`;navigator.clipboard.writeText(csv).then(()=>toast('📋 Đã copy CSV!'));}
function exportDashJSON(){const b=new Blob([JSON.stringify(state.history,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`monstea-data-${today()}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);toast('💾 Đã tải JSON!');}
function exportAttCSV(){const td=today(),recs=state.attendance[td]||[];let csv='Tên,Vào ca,Ra ca,Số giờ\n';recs.forEach(r=>{csv+=`"${r.name}","${r.checkIn}","${r.checkOut||''}",${r.hours||''}\n`;});navigator.clipboard.writeText(csv).then(()=>toast('📋 Đã copy CSV chấm công!'));}
function downloadBackup(){const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`monstea-backup-${today()}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);toast('📥 Đã tải backup!');}
function restoreBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{const p=JSON.parse(ev.target.result);if(!p.menu){toast('❌ File không hợp lệ');return;}state={...state,...p};localStorage.setItem('monsteaPOS',JSON.stringify(state));if(firebaseDb){isRemoteUpdate=true;const restored=cloneData(state);restored.currentOrder=[];delete restored._editingInvoiceId;delete restored._editingInvoiceRef;delete restored._editingOldSummary;firebaseDb.ref('state').transaction(remote=>mergeStateData(remote||{},restored,true),(err,committed,snap)=>{isRemoteUpdate=false;if(err){toast('✅ Đã khôi phục (chưa sync cloud)');return;}if(committed&&snap&&snap.val())state=mergeStateData(snap.val(),state,false);updateSyncStatus('connected');toast('✅ Đã khôi phục & đồng bộ lên cloud!');renderAll();});}else{toast('✅ Đã khôi phục!');renderAll();}}catch(err){toast('❌ Lỗi: '+err.message);}};r.readAsText(f);e.target.value='';}
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
    const searchEl=document.getElementById('guideSearchInput');
    const query=(searchEl?searchEl.value:'').toLowerCase().trim();
    const items=activeItems(state.menu).filter(m=>m.active&&(guideCategory==='Tất cả'||m.category===guideCategory)&&(!query||searchMatch(m.name,query)));
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
    state.menu.push({id:newId,name:n,price:0,category:cat,active:true,isGuide:true,_lastModified:Date.now()});
    saveState();
    renderGuide();
    showGuide(newId);
    toast('✅ Đã tạo hướng dẫn mới');
}
function setGuideCategory(c){guideCategory=c;renderGuide();}
function showGuide(id){
    const m=activeItems(state.menu).find(x=>x.id===id);if(!m)return;
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
activeItems(state.staff).forEach(s=>{if(!sched[s.id])sched[s.id]=[false,false,false,false,false,false,false];
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
if(!state.weekScheduleUpdatedAt)state.weekScheduleUpdatedAt={};
state.weekScheduleUpdatedAt[`${wk}:${staffId}`]=Date.now();
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
else{const sm=activeItems(state.staff).find(s=>s.password===_sp);if(sm){currentRole='staff';currentStaffId=sm.id;currentStaffName=sm.name;document.getElementById('loginOverlay').style.display='none';applyRole();initFirebase();}}
}else{document.getElementById('loginPwd').focus();}

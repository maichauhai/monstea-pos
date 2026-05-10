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


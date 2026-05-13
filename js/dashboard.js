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
let tr=0,ti=0,ct=0,tt=0;const is={},isById={},hr={};
dates.forEach(d=>{const dd=state.history[d];if(!dd)return;tr+=dd.totalRevenue;ti+=dd.invoices;ct+=dd.cashTotal||0;tt+=dd.transferTotal||0;
if(dd.itemsSold)Object.entries(dd.itemsSold).forEach(([n,x])=>{if(!is[n])is[n]={qty:0,revenue:0};is[n].qty+=x.qty;is[n].revenue+=x.revenue;});
if(dd.itemsSoldById)Object.entries(dd.itemsSoldById).forEach(([id,x])=>{if(!isById[id])isById[id]={name:x.name,qty:0,revenue:0};isById[id].qty+=x.qty;isById[id].revenue+=x.revenue;});
if(dd.hourlyRevenue)Object.entries(dd.hourlyRevenue).forEach(([h,r])=>{hr[h]=(hr[h]||0)+r;});});
return{dates,totalRevenue:tr,totalInvoices:ti,cashTotal:ct,transferTotal:tt,itemsSold:is,itemsSoldById:isById,hourlyRevenue:hr};}

function calcIngredientCost(dashData){
    let total=0;
    if(dashData.itemsSoldById&&Object.keys(dashData.itemsSoldById).length){
        Object.entries(dashData.itemsSoldById).forEach(([menuId,data])=>{
            const recipe=state.recipes[menuId]||[];
            recipe.forEach(r=>{const ing=activeItems(state.ingredients).find(i=>i.id===r.ingId);
            if(!ing)return;total+=r.qty*data.qty*ing.unitPrice;});
        });
        return Math.round(total);
    }
    Object.entries(dashData.itemsSold).forEach(([name,data])=>{
        const mi=activeItems(state.menu).find(m=>m.name===name);if(!mi)return;
        const recipe=state.recipes[mi.id]||[];
        recipe.forEach(r=>{const ing=activeItems(state.ingredients).find(i=>i.id===r.ingId);
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
    let otherExp=0; d.dates.forEach(dt=>{activeItems((state.expenses||{})[dt]||[]).forEach(e=>otherExp+=e.amount);});
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

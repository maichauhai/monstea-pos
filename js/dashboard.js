// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
function setDashFilter(f){
    dashFilter=f;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
    if(f==='range'){
        const td=today();
        const s=document.getElementById('dashRangeStart'),e=document.getElementById('dashRangeEnd');
        if(s&&!s.value)s.value=td;
        if(e&&!e.value)e.value=td;
    }
    renderDashboard();
}

function dateKeyLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function monthDateKey(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function parseDateKeyLocal(key){
    const m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):new Date();
}
function datesBetween(startKey,endKey){
    let s=parseDateKeyLocal(startKey),e=parseDateKeyLocal(endKey);
    if(s>e){const t=s;s=e;e=t;}
    const out=[];
    for(const d=new Date(s);d<=e;d.setDate(d.getDate()+1))out.push(dateKeyLocal(d));
    return out;
}
function recentDates(days){
    const td=parseDateKeyLocal(today()),out=[];
    for(let i=days-1;i>=0;i--){const d=new Date(td);d.setDate(d.getDate()-i);out.push(dateKeyLocal(d));}
    return out;
}
function monthDatesToToday(){
    const now=parseDateKeyLocal(today()),out=[];
    for(let d=1;d<=now.getDate();d++)out.push(monthDateKey(now.getFullYear(),now.getMonth(),d));
    return out;
}
function getAllFinancialDateKeys(){
    const keys=new Set(Object.keys(state.history||{}));
    Object.keys(state.attendance||{}).forEach(k=>keys.add(k));
    Object.keys(state.purchases||{}).forEach(k=>keys.add(k));
    Object.keys(state.expenses||{}).forEach(k=>keys.add(k));
    activeItems(state.salaryPayments||[]).forEach(p=>{
        if(p.paidDate)keys.add(p.paidDate);
        if(p.periodStart)keys.add(p.periodStart);
        if(p.periodEnd)keys.add(p.periodEnd);
    });
    return [...keys].filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
}
function getDashRange(){
    const td=today();
    if(dashFilter==='today')return{dates:[td],start:td,end:td,label:'Hôm nay'};
    if(dashFilter==='week'){
        const dates=recentDates(7);
        return{dates,start:dates[0],end:dates[dates.length-1],label:'7 ngày gần nhất'};
    }
    if(dashFilter==='month'){
        const dates=monthDatesToToday();
        return{dates,start:dates[0],end:dates[dates.length-1],label:'Tháng này'};
    }
    if(dashFilter==='last30'){
        const dates=recentDates(30);
        return{dates,start:dates[0],end:dates[dates.length-1],label:'1 tháng gần nhất'};
    }
    if(dashFilter==='last90'){
        const dates=recentDates(90);
        return{dates,start:dates[0],end:dates[dates.length-1],label:'3 tháng gần nhất'};
    }
    if(dashFilter==='all'){
        const keys=getAllFinancialDateKeys();
        if(!keys.length)return{dates:[td],start:td,end:td,label:'Toàn bộ thời gian',allTime:true};
        const end=keys[keys.length-1]>td?keys[keys.length-1]:td;
        return{dates:datesBetween(keys[0],end),start:keys[0],end,label:'Toàn bộ thời gian',allTime:true};
    }
    if(dashFilter==='range'){
        const s=document.getElementById('dashRangeStart')?.value||td;
        const e=document.getElementById('dashRangeEnd')?.value||s;
        const dates=datesBetween(s,e);
        return{dates,start:dates[0],end:dates[dates.length-1],label:`${dates[0]} → ${dates[dates.length-1]}`};
    }
    const p=document.getElementById('dashDatePick')?.value||td;
    return{dates:[p],start:p,end:p,label:p};
}

function eachSoldEntry(dayData,cb){
    if(!dayData)return;
    const byId=dayData.itemsSoldById&&Object.keys(dayData.itemsSoldById).length?dayData.itemsSoldById:null;
    if(byId){
        Object.entries(byId).forEach(([menuId,data])=>{
            const mi=activeItems(state.menu).find(m=>String(m.id)===String(menuId));
            cb({menuId,name:data.name||mi?.name||String(menuId),qty:Number(data.qty)||0,revenue:Number(data.revenue)||0});
        });
        return;
    }
    Object.entries(dayData.itemsSold||{}).forEach(([name,data])=>{
        const mi=activeItems(state.menu).find(m=>m.name===name);
        cb({menuId:mi?.id,name,qty:Number(data.qty)||0,revenue:Number(data.revenue)||0});
    });
}
function calcIngredientCostForDates(dates){
    let total=0;
    dates.forEach(dt=>{
        eachSoldEntry(state.history[dt],entry=>{
            const recipe=entry.menuId!==undefined?(state.recipes[entry.menuId]||[]):[];
            recipe.forEach(r=>{const ing=activeItems(state.ingredients).find(i=>i.id===r.ingId);
            if(!ing)return;total+=r.qty*entry.qty*ing.unitPrice;});
        });
    });
    return Math.round(total);
}
function collectSalesForDates(dates){
    const td=today();
    if(dates.includes(td))archiveDay(td,state.todayInvoices);
    let tr=0,ti=0,ct=0,tt=0,grabTotal=0,grabNet=0;const is={},isById={},hr={};
    dates.forEach(d=>{
        const dd=state.history[d];if(!dd)return;
        tr+=Number(dd.totalRevenue)||0;ti+=Number(dd.invoices)||0;ct+=Number(dd.cashTotal)||0;tt+=Number(dd.transferTotal)||0;
        grabTotal+=Number(dd.grabTotal)||0;grabNet+=Number(dd.grabNet)||Number(dd.grabTotal)||0;
        eachSoldEntry(dd,entry=>{
            if(!is[entry.name])is[entry.name]={qty:0,revenue:0};
            is[entry.name].qty+=entry.qty;is[entry.name].revenue+=entry.revenue;
            if(entry.menuId!==undefined){
                if(!isById[entry.menuId])isById[entry.menuId]={name:entry.name,qty:0,revenue:0};
                isById[entry.menuId].qty+=entry.qty;isById[entry.menuId].revenue+=entry.revenue;
            }
        });
        if(dd.hourlyRevenue)Object.entries(dd.hourlyRevenue).forEach(([h,r])=>{hr[h]=(hr[h]||0)+r;});
    });
    const transferNonGrab=Math.max(0,tt-grabTotal);
    const realRevenue=ct+transferNonGrab+grabNet;
    return{dates,totalRevenue:tr,totalInvoices:ti,cashTotal:ct,transferTotal:tt,transferNonGrab,grabTotal,grabNet,grabFee:Math.max(0,grabTotal-grabNet),realRevenue,itemsSold:is,itemsSoldById:isById,hourlyRevenue:hr};
}
function getDashData(){return collectSalesForDates(getDashRange().dates);}

function calcIngredientCost(dashData){
    return calcIngredientCostForDates(dashData.dates||[]);
}
function getStaffById(id){return (state.staff||[]).find(s=>String(s.id)===String(id));}
function calcWageForRecord(r,staff){
    const OT_MULT=1.3,OT_HOUR=22*60;
    if(!r.checkIn||!r.checkOut||!r.hours)return{normalH:0,otH:0,total:0};
    const rate=Number(r.wageRate)||Number(staff?.wageRate)||25000;
    const [iH,iM]=String(r.checkIn).split(':').map(Number);
    const [oH,oM]=String(r.checkOut).split(':').map(Number);
    const inMin=(iH||0)*60+(iM||0),outMin=(oH||0)*60+(oM||0);
    let normalH=Number(r.hours)||0,otH=0;
    if(outMin>OT_HOUR){
        normalH=Math.max(0,(Math.min(outMin,OT_HOUR)-inMin)/60);
        otH=Math.max(0,(outMin-Math.max(inMin,OT_HOUR))/60);
    }
    return{normalH,otH,total:Math.round(normalH*rate+otH*rate*OT_MULT)};
}
function calcLaborBreakdown(dates){
    const byStaff=new Map();
    activeItems(state.staff||[]).forEach(s=>byStaff.set(String(s.id),{staffId:s.id,staffName:s.name,days:0,totalH:0,normalH:0,otH:0,totalWage:0}));
    dates.forEach(d=>{
        ((state.attendance||{})[d]||[]).forEach(r=>{
            if(!r||!r.checkIn||!r.checkOut||!r.hours)return;
            const staff=getStaffById(r.staffId);
            const key=String(r.staffId||r.name||'unknown');
            if(!byStaff.has(key))byStaff.set(key,{staffId:r.staffId||key,staffName:r.name||staff?.name||'Nhân viên',days:0,totalH:0,normalH:0,otH:0,totalWage:0});
            const row=byStaff.get(key),w=calcWageForRecord(r,staff);
            row.days++;row.totalH+=Number(r.hours)||0;row.normalH+=w.normalH;row.otH+=w.otH;row.totalWage+=w.total;
        });
    });
    const staff=[...byStaff.values()].map(r=>({...r,totalWage:Math.round(r.totalWage)})).sort((a,b)=>b.totalWage-a.totalWage||String(a.staffName).localeCompare(String(b.staffName)));
    return{total:staff.reduce((s,r)=>s+r.totalWage,0),staff};
}
function calcLaborCost(dates){return calcLaborBreakdown(dates).total;}

function sumBucket(dates,buckets,field){
    let total=0;
    dates.forEach(dt=>activeItems((buckets||{})[dt]||[]).forEach(x=>total+=Number(x[field])||0));
    return Math.round(total);
}
function paymentInPeriod(p,range){
    if(range.allTime)return true;
    const ps=p.periodStart||p.paidDate,pe=p.periodEnd||ps;
    return ps>=range.start&&pe<=range.end;
}
function paymentPaidInDates(p,dateSet){return p.paidDate&&dateSet.has(p.paidDate);}
function getFinancialRangeData(rangeOverride){
    const range=rangeOverride||getDashRange();
    const dates=range.dates||[];
    const dateSet=new Set(dates);
    const sales=collectSalesForDates(dates);
    const ingredientCost=calcIngredientCostForDates(dates);
    const labor=calcLaborBreakdown(dates);
    const purchasesCost=sumBucket(dates,state.purchases,'totalCost');
    const otherExpenses=sumBucket(dates,state.expenses,'amount');
    const payments=activeItems(state.salaryPayments||[]);
    const salaryPaidForPeriod=payments.filter(p=>paymentInPeriod(p,range)).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const salaryPaidCashOut=payments.filter(p=>paymentPaidInDates(p,dateSet)).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const paidByStaff={};
    payments.filter(p=>paymentInPeriod(p,range)).forEach(p=>{const k=String(p.staffId);paidByStaff[k]=(paidByStaff[k]||0)+(Number(p.amount)||0);});
    labor.staff.forEach(r=>{
        r.paid=paidByStaff[String(r.staffId)]||0;
        r.remaining=Math.max(0,r.totalWage-r.paid);
    });
    const salaryRemaining=Math.max(0,labor.total-salaryPaidForPeriod);
    const grossProfit=sales.totalRevenue-ingredientCost-labor.total;
    const netProfit=sales.realRevenue-ingredientCost-labor.total-otherExpenses;
    const cashOutPaid=purchasesCost+otherExpenses+salaryPaidCashOut;
    const cashNet=sales.realRevenue-cashOutPaid;
    const netAfterPayables=cashNet-salaryRemaining;
    const dailyRows=dates.map(dt=>{
        const ds=collectSalesForDates([dt]),dcogs=calcIngredientCostForDates([dt]),dlabor=calcLaborBreakdown([dt]);
        const dp=sumBucket([dt],state.purchases,'totalCost'),doe=sumBucket([dt],state.expenses,'amount');
        const dsp=payments.filter(p=>p.paidDate===dt).reduce((s,p)=>s+(Number(p.amount)||0),0);
        return{date:dt,revenue:ds.realRevenue,grossRevenue:ds.totalRevenue,ingredientCost:dcogs,laborCost:dlabor.total,purchases:dp,otherExpenses:doe,salaryPaid:dsp,cashOut:dp+doe+dsp,cashNet:ds.realRevenue-dp-doe-dsp,netProfit:ds.realRevenue-dcogs-dlabor.total-doe};
    });
    return{range,sales,ingredientCost,labor,laborCost:labor.total,purchasesCost,otherExpenses,salaryPaidForPeriod,salaryPaidCashOut,salaryRemaining,grossProfit,netProfit,cashOutPaid,cashNet,netAfterPayables,dailyRows};
}

function statCard(label, value, color, extra='') {
    return `<div class="stat-card"${extra}><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value}</div></div>`;
}
function smallMoneyCell(n,color){
    return `<span class="money-table-value" style="font-weight:700;color:${color||'var(--text-primary)'};">${fmtP(n)}</span>`;
}
function renderDashboard(){
    const f=getFinancialRangeData(),d=f.sales,avg=d.totalInvoices?Math.round(d.totalRevenue/d.totalInvoices):0;
    document.getElementById('dashStats').innerHTML = [
        statCard('Doanh thu', fmtP(d.totalRevenue), 'var(--accent)'),
        statCard('Thực nhận', fmtP(d.realRevenue), 'var(--accent-green)'),
        statCard('Hóa đơn', d.totalInvoices, 'var(--accent-blue)'),
        statCard('TB/đơn', fmtP(avg), 'var(--accent-warm)'),
        statCard('Tiền mặt', fmtP(d.cashTotal), 'var(--accent-green)'),
        statCard('CK/Grab gross', fmtP(d.transferTotal), 'var(--accent-purple)'),
        statCard('Chi phí NL', fmtP(f.ingredientCost), 'var(--accent-red)', ' style="border-color:rgba(255,107,107,0.2);background:rgba(255,107,107,0.04)"'),
        statCard('Lương phải trả', fmtP(f.laborCost), 'var(--accent-blue)', ' style="border-color:rgba(96,165,250,0.2);background:rgba(96,165,250,0.04)"'),
        statCard('CP khác', fmtP(f.otherExpenses), '#fbbf24', ' style="border-color:rgba(251,191,36,0.2);background:rgba(251,191,36,0.04)"'),
        statCard('Lãi ròng', fmtP(f.netProfit), f.netProfit>=0?'var(--accent-green)':'var(--accent-red)', ' style="border-color:rgba(74,222,128,0.25);background:rgba(74,222,128,0.06)"'),
    ].join('');
    renderCashFlowSection(f);
    renderRevenueChart(f.range);
    renderHourlyChart(d.hourlyRevenue);
    renderMonthlyReport();
    const ti=Object.entries(d.itemsSold).map(([n,x])=>({name:n,...x})).sort((a,b)=>b.qty-a.qty),tq=ti.reduce((s,i)=>s+i.qty,0);
    document.getElementById('topItemsBody').innerHTML=ti.length?ti.map((i,x)=>`<tr><td style="color:${x<3?'var(--accent)':'var(--text-muted)'};font-weight:${x<3?700:400}">${x+1}</td><td>${x===0?'🏆 ':''}${esc(i.name)}</td><td style="font-weight:600">${i.qty}</td><td style="color:var(--accent-warm)">${fmtP(i.revenue)}</td><td style="color:var(--text-muted)">${tq?Math.round(i.qty/tq*100):0}%</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">Chưa có dữ liệu</td></tr>';
}

function renderCashFlowSection(f){
    const el=document.getElementById('cashFlowSection');
    if(!el)return;
    const canEdit=currentRole==='owner';
    const salaryRows=f.labor.staff.filter(r=>r.totalWage||r.paid).map(r=>{
        const actions=canEdit?`<button class="btn btn-primary btn-sm" onclick="markSalaryPaid('${jsString(String(r.staffId))}')" style="font-size:0.68rem;padding:4px 8px;">Ghi trả</button>
        <button class="btn btn-secondary btn-sm" onclick="undoSalaryPayment('${jsString(String(r.staffId))}')" style="font-size:0.68rem;padding:4px 8px;">Hoàn tác</button>`:'';
        return `<tr>
            <td style="padding:6px;font-weight:700;">${esc(r.staffName)}</td>
            <td style="padding:6px;text-align:center;">${r.days}</td>
            <td style="padding:6px;text-align:center;">${Math.round(r.totalH*10)/10}h</td>
            <td style="padding:6px;text-align:right;">${smallMoneyCell(r.totalWage,'var(--accent-blue)')}</td>
            <td style="padding:6px;text-align:right;">${smallMoneyCell(r.paid,'var(--accent-green)')}</td>
            <td style="padding:6px;text-align:right;">${smallMoneyCell(r.remaining,r.remaining?'var(--accent-red)':'var(--accent-green)')}</td>
            <td style="padding:6px;text-align:right;white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join('');
    const dailyRows=f.dailyRows.filter(r=>r.grossRevenue||r.cashOut||r.salaryPaid||r.netProfit).slice(-35).reverse().map(r=>`<tr>
        <td style="padding:6px;color:var(--text-muted);">${r.date}</td>
        <td style="padding:6px;text-align:right;">${fmtP(r.revenue)}</td>
        <td style="padding:6px;text-align:right;">${fmtP(r.purchases+r.otherExpenses)}</td>
        <td style="padding:6px;text-align:right;color:var(--accent-blue);">${fmtP(r.salaryPaid)}</td>
        <td style="padding:6px;text-align:right;color:${r.cashNet>=0?'var(--accent-green)':'var(--accent-red)'};font-weight:700;">${fmtP(r.cashNet)}</td>
        <td style="padding:6px;text-align:right;color:${r.netProfit>=0?'var(--accent-green)':'var(--accent-red)'};">${fmtP(r.netProfit)}</td>
    </tr>`).join('');
    const allRecentPayments=activeItems(state.salaryPayments||[]).sort((a,b)=>(Number(b._lastModified)||0)-(Number(a._lastModified)||0));
    const recentPayments=allRecentPayments.slice(0,8).map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.74rem;">
        <span style="flex:1;">${esc(p.staffName||'Nhân viên')} · ${esc(p.periodStart||'')} → ${esc(p.periodEnd||'')}</span>
        <span style="color:var(--accent-green);font-weight:800;">${fmtP(p.amount||0)}</span>
        <span style="color:var(--text-muted);">${esc(p.paidDate||'')}</span>
        ${canEdit?`<button class="btn btn-danger btn-sm" onclick="deleteSalaryPayment('${jsString(String(p.syncId||p.id))}')" style="font-size:0.65rem;padding:3px 7px;">Xóa</button>`:''}
    </div>`).join('');
    el.innerHTML=`<div class="card" style="margin-top:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
            <div>
                <div class="card-title" style="margin-bottom:2px;">💵 Dòng tiền & lương</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">Kỳ: ${esc(f.range.label)} · Grab tính theo tiền thực nhận.</div>
            </div>
        </div>
        <div class="cashflow-stat-grid">
            ${statCard('Tiền vào thực nhận',fmtP(f.sales.realRevenue),'var(--accent-green)')}
            ${statCard('Đã chi NL+khác+lương',fmtP(f.cashOutPaid),'var(--accent-red)')}
            ${statCard('Dòng tiền',fmtP(f.cashNet),f.cashNet>=0?'var(--accent-green)':'var(--accent-red)')}
            ${statCard('Lãi ròng',fmtP(f.netProfit),f.netProfit>=0?'var(--accent-green)':'var(--accent-red)')}
            ${statCard('Phải trả lương',fmtP(f.laborCost),'var(--accent-blue)')}
            ${statCard('Đã trả cho kỳ',fmtP(f.salaryPaidForPeriod),'var(--accent-green)')}
            ${statCard('Còn phải trả',fmtP(f.salaryRemaining),f.salaryRemaining?'var(--accent-red)':'var(--accent-green)')}
            ${statCard('Sau khi trả lương',fmtP(f.netAfterPayables),f.netAfterPayables>=0?'var(--accent-green)':'var(--accent-red)')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;align-items:start;">
            <div style="overflow:auto;">
                <div style="font-weight:800;font-size:0.82rem;margin-bottom:6px;">Lương phải trả / đã trả</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.74rem;">
                    <thead><tr style="border-bottom:2px solid var(--border-subtle);">
                        <th style="padding:6px;text-align:left;">NV</th><th>Ngày</th><th>Giờ</th><th style="text-align:right;">Phải trả</th><th style="text-align:right;">Đã trả</th><th style="text-align:right;">Còn lại</th><th></th>
                    </tr></thead>
                    <tbody>${salaryRows||'<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:14px;">Chưa có lương trong kỳ</td></tr>'}</tbody>
                </table>
            </div>
            <details class="cashflow-collapse">
                <summary>Lịch sử trả lương gần đây <span style="font-weight:600;color:var(--text-muted);font-size:0.72rem;">${allRecentPayments.length} bản ghi</span></summary>
                <div class="collapse-body">${recentPayments||'<div style="color:var(--text-muted);font-size:0.76rem;padding:8px 0;">Chưa có bản ghi trả lương.</div>'}</div>
            </details>
        </div>
        <details class="cashflow-collapse" style="margin-top:14px;">
            <summary>Dòng tiền theo ngày <span style="font-weight:600;color:var(--text-muted);font-size:0.72rem;">${f.dailyRows.length} ngày</span></summary>
            <div class="collapse-body">
            <table style="width:100%;border-collapse:collapse;font-size:0.74rem;">
                <thead><tr style="border-bottom:2px solid var(--border-subtle);">
                    <th style="padding:6px;text-align:left;">Ngày</th><th style="text-align:right;">Tiền vào</th><th style="text-align:right;">Chi NL/khác</th><th style="text-align:right;">Lương đã trả</th><th style="text-align:right;">Dòng tiền</th><th style="text-align:right;">Lãi ròng</th>
                </tr></thead>
                <tbody>${dailyRows||'<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:14px;">Chưa có dữ liệu dòng tiền</td></tr>'}</tbody>
            </table>
            </div>
        </details>
    </div>`;
}

function markSalaryPaid(staffKey){
    if(currentRole!=='owner'){toast('Chỉ chủ quán được ghi nhận trả lương');return;}
    const f=getFinancialRangeData();
    const row=f.labor.staff.find(r=>String(r.staffId)===String(staffKey));
    if(!row||row.remaining<=0){toast('Không còn lương phải trả trong kỳ này');return;}
    const raw=prompt(`Số tiền trả cho ${row.staffName} (nhập đơn vị nghìn, VD 350 = 350.000đ):`,String(Math.round(row.remaining/1000)));
    if(raw===null)return;
    const amount=Math.round((parseFloat(String(raw).replace(',','.'))||0)*1000);
    if(amount<=0){toast('Số tiền không hợp lệ');return;}
    if(amount>row.remaining&&!confirm('Số tiền lớn hơn phần còn lại. Vẫn ghi nhận?'))return;
    state.salaryPayments=state.salaryPayments||[];
    if(!Number.isFinite(Number(state.nextSalaryPaymentId))||Number(state.nextSalaryPaymentId)<1){
        state.nextSalaryPaymentId=((state.salaryPayments||[]).reduce((m,p)=>Math.max(m,Number(p?.id)||0),0))+1;
    }
    state.salaryPayments.push({
        id:state.nextSalaryPaymentId++,
        syncId:makeSyncId('salary'),
        _lastModified:Date.now(),
        staffId:row.staffId,
        staffName:row.staffName,
        periodStart:f.range.start,
        periodEnd:f.range.end,
        amount,
        paidDate:today(),
        paidTime:nowTime(),
        note:`Thanh toán lương ${f.range.label}`
    });
    saveState();renderDashboard();toast(`Đã ghi trả ${fmtP(amount)} cho ${row.staffName}`);
}
function undoSalaryPayment(staffKey){
    if(currentRole!=='owner'){toast('Chỉ chủ quán được hoàn tác trả lương');return;}
    const f=getFinancialRangeData();
    const payments=activeItems(state.salaryPayments||[]).filter(p=>String(p.staffId)===String(staffKey)&&paymentInPeriod(p,f.range)).sort((a,b)=>(Number(b._lastModified)||0)-(Number(a._lastModified)||0));
    if(!payments.length){toast('Không có khoản trả lương trong kỳ này');return;}
    deleteSalaryPayment(payments[0].syncId||payments[0].id);
}
function deleteSalaryPayment(ref){
    if(currentRole!=='owner'){toast('Chỉ chủ quán được xóa trả lương');return;}
    confirmAction('Xóa/hoàn tác bản ghi trả lương này?',()=>{
        const p=(state.salaryPayments||[]).find(x=>String(x.syncId||x.id)===String(ref));
        if(!p)return;
        p._deleted=true;p._lastModified=Date.now();
        saveState();renderDashboard();toast('Đã hoàn tác trả lương');
    },'Xóa');
}

function renderRevenueChart(range){
    const c=document.getElementById('revenueChart');
    if(!c)return;
    const source=(range&&range.dates)?(range.dates.length<=14?range.dates:range.dates.slice(-14)):recentDates(7);
    const dn=['CN','T2','T3','T4','T5','T6','T7'];
    const days=source.map(k=>{
        const d=parseDateKeyLocal(k);
        return{k,label:k===today()?'Nay':dn[d.getDay()],rev:state.history[k]?.totalRevenue||0};
    });
    const mx=Math.max(...days.map(d=>d.rev),1);
    c.innerHTML=days.map(d=>`<div class="bar-col"><div class="bar-value">${d.rev?fmtS(d.rev):''}</div><div class="bar-fill" style="height:${Math.max(4,d.rev/mx*160)}px;${d.k===today()?'background:var(--accent)':''}"></div><div class="bar-label">${d.label}</div></div>`).join('');
}

function renderHourlyChart(hr){
    const c=document.getElementById('hourlyChart'),hours=[];
    if(!c)return;
    for(let h=6;h<=23;h++)hours.push({h,rev:hr?.[h]||0});
    const mx=Math.max(...hours.map(h=>h.rev),1),pk=hours.reduce((m,h)=>h.rev>m.rev?h:m,hours[0]);
    c.innerHTML=hours.map(h=>`<div class="hourly-bar ${h.h===pk.h&&h.rev>0?'peak':''}" style="height:${Math.max(2,h.rev/mx*90)}px" title="${h.h}h: ${fmtP(h.rev)}"></div>`).join('');
}

// ═══════════════════════════════════════

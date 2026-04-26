/**
 * ═══════════════════════════════════════════════
 * MONSTEA POS → GOOGLE SHEETS AUTO SYNC v2
 * ═══════════════════════════════════════════════
 * 
 * Tự động chạy 23:50 mỗi ngày (via Trigger)
 * 
 * Sheet "Doanh thu": 1 dòng/ngày — DT POS, Grab (nhập tay), Tổng, NL, NV, Lãi
 * Sheet "Nguyen lieu dung": Cộng dồn — 1 dòng/NL, cập nhật mỗi ngày
 * Sheet "Cham cong": Chi tiết từng NV/ngày
 * ═══════════════════════════════════════════════
 */

// ── CONFIG ──
var FIREBASE_URL = 'https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app';
var SHEET_DOANHTHU = 'Doanh thu';
var SHEET_CHAMCONG = 'Cham cong';
var SHEET_NGUYENLIEU = 'Nguyen lieu dung';
var HOURLY_RATE = 25000; // 25K/giờ

// ── MAIN ──
function syncDaily() {
  var state = fetchFirebaseState();
  if (!state) { Logger.log('Khong doc duoc Firebase'); return; }
  
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  
  var nlCost = syncNguyenlieu(state, today);
  var laborCost = syncChamcong(state, today);
  syncDoanhthu(state, today, nlCost, laborCost);
  
  Logger.log('Sync xong ngay ' + today + ' | NL: ' + nlCost + ' | NV: ' + laborCost);
}

// ── Đọc Firebase ──
function fetchFirebaseState() {
  try {
    var response = UrlFetchApp.fetch(FIREBASE_URL + '/state.json');
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log('Firebase error: ' + e.message);
    return null;
  }
}

// ═══════════════════════════════════════
// SHEET 1: DOANH THU — 1 dòng/ngày
// ═══════════════════════════════════════
function syncDoanhthu(state, today, nlCost, laborCost) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DOANHTHU);
  if (!sheet) { sheet = ss.insertSheet(SHEET_DOANHTHU); }
  
  // Header
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Ngay', 'So don', 'DT POS', 'Grab', 'Phi Grab (48%)', 'Tong DT',
      'TB/don', 'Tien mat', 'CK',
      'Chi phi NL', 'Chi phi NV', 'Lai gop'
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#f0c060');
    sheet.setFrozenRows(1);
  }
  
  // Kiểm tra đã sync ngày này chưa
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existingDates = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    for (var i = 0; i < existingDates.length; i++) {
      if (existingDates[i] === today) {
        Logger.log('Doanh thu ngay ' + today + ' da sync, bo qua');
        return;
      }
    }
  }
  
  // Tính doanh thu từ hóa đơn — tách POS vs Grab
  var invoices = (state.todayInvoices || []).filter(function(inv) { return inv.date === today; });
  
  var posRevenue = 0, totalCash = 0, totalTransfer = 0, posCount = 0;
  var grabRevenue = 0;
  invoices.forEach(function(inv) {
    if (inv.cancelled) return;
    if (inv.method === 'grab') {
      grabRevenue += inv.total;
    } else {
      posCount++;
      posRevenue += inv.total;
      if (inv.method === 'cash') totalCash += inv.total;
      else totalTransfer += inv.total;
    }
  });
  
  // Grab fee 48%
  var grabFee = Math.round(grabRevenue * 0.48);
  var grabNet = grabRevenue - grabFee;
  
  var totalCount = posCount;
  var avg = totalCount > 0 ? Math.round(posRevenue / totalCount) : 0;
  
  // Ghi 1 dòng
  sheet.appendRow([
    today,
    totalCount,
    posRevenue,
    grabRevenue,
    grabFee,  // Phí Grab 48%
    '', // Tổng DT = formula (POS + Grab - Phí Grab)
    avg,
    totalCash,
    totalTransfer,
    nlCost || 0,
    laborCost || 0,
    '' // Lãi gộp = formula
  ]);
  
  var row = sheet.getLastRow();
  
  // Formula: Tổng DT = DT POS + Grab - Phí Grab (C + D - E)
  sheet.getRange(row, 6).setFormula('=C' + row + '+D' + row + '-E' + row);
  
  // Formula: Lãi gộp = Tổng DT - Chi phí NL - Chi phí NV (F - J - K)
  sheet.getRange(row, 12).setFormula('=F' + row + '-J' + row + '-K' + row);
  
  // Format number
  sheet.getRange(row, 3, 1, 10).setNumberFormat('#,##0');
  
  // Color Phí Grab red
  if (grabFee > 0) sheet.getRange(row, 5).setFontColor('#ff6b6b');
  
  // Color Lãi gộp
  var laiGop = posRevenue + grabNet - (nlCost || 0) - (laborCost || 0);
  if (laiGop >= 0) {
    sheet.getRange(row, 12).setFontColor('#4ade80');
  } else {
    sheet.getRange(row, 12).setFontColor('#ff6b6b');
  }
  
  Logger.log('Doanh thu: ' + totalCount + ' don POS, ' + posRevenue + 'd + Grab ' + grabRevenue + 'd (-' + grabFee + ' phi), NL: ' + nlCost + ', NV: ' + laborCost);
}

// ═══════════════════════════════════════
// SHEET 2: CHẤM CÔNG — Chi tiết, trả về tổng chi phí NV
// ═══════════════════════════════════════
function syncChamcong(state, today) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CHAMCONG);
  if (!sheet) { sheet = ss.insertSheet(SHEET_CHAMCONG); }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Ngay', 'Nhan vien', 'Check-in', 'Check-out', 'So gio', 'Luong (25K, +30% sau 22h)']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#60a5fa');
    sheet.setFrozenRows(1);
  }
  
  // Kiểm tra trùng
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existingDates = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    for (var i = 0; i < existingDates.length; i++) {
      if (existingDates[i] === today) {
        // Đã sync — tính lại labor cost từ sheet
        var totalLabor = 0;
        for (var j = 0; j < existingDates.length; j++) {
          if (existingDates[j] === today) {
            var wage = sheet.getRange(j + 2, 6).getValue();
            totalLabor += (typeof wage === 'number' ? wage : 0);
          }
        }
        Logger.log('Cham cong da sync, labor = ' + totalLabor);
        return totalLabor;
      }
    }
  }
  
  var todayAtt = state.attendance && state.attendance[today] ? state.attendance[today] : null;
  var staff = state.staff || [];
  
  if (!todayAtt) {
    Logger.log('Khong co cham cong');
    return 0;
  }
  
  var rows = [];
  var totalLaborCost = 0;
  
  staff.forEach(function(s) {
    var record = todayAtt[String(s.id)];
    if (!record) return;
    
    var checkIn = record['in'] || record.checkIn || '';
    var checkOut = record['out'] || record.checkOut || '';
    
    var hours = 0;
    if (checkIn && checkOut) {
      var p1 = checkIn.split(':'), p2 = checkOut.split(':');
      var inMin = Number(p1[0]) * 60 + Number(p1[1]);
      var outMin = Number(p2[0]) * 60 + Number(p2[1]);
      var diff = outMin - inMin;
      hours = diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0;
    }
    
    // Tính lương: trước 22h = 25K, sau 22h = 25K × 1.3
    var wage = 0;
    if (checkIn && checkOut) {
      var inM = Number(checkIn.split(':')[0]) * 60 + Number(checkIn.split(':')[1]);
      var outM = Number(checkOut.split(':')[0]) * 60 + Number(checkOut.split(':')[1]);
      var cutoff = 22 * 60; // 22:00 = 1320 phút
      
      if (outM <= cutoff) {
        // Toàn bộ trước 22h
        wage = Math.round(hours * HOURLY_RATE);
      } else if (inM >= cutoff) {
        // Toàn bộ sau 22h → x1.3
        wage = Math.round(hours * HOURLY_RATE * 1.3);
      } else {
        // Chia đôi: trước + sau 22h
        var normalMin = cutoff - inM;
        var otMin = outM - cutoff;
        var normalH = Math.round(normalMin / 60 * 10) / 10;
        var otH = Math.round(otMin / 60 * 10) / 10;
        wage = Math.round(normalH * HOURLY_RATE + otH * HOURLY_RATE * 1.3);
      }
    }
    totalLaborCost += wage;
    
    rows.push([today, s.name, checkIn, checkOut, hours, wage]);
  });
  
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    // Format wage column
    sheet.getRange(sheet.getLastRow() - rows.length + 1, 6, rows.length, 1).setNumberFormat('#,##0');
    Logger.log('Cham cong: ' + rows.length + ' NV, tong luong: ' + totalLaborCost);
  }
  
  return totalLaborCost;
}

// ═══════════════════════════════════════
// SHEET 3: NGUYÊN LIỆU DÙNG — Cộng dồn
// ═══════════════════════════════════════
function syncNguyenlieu(state, today) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NGUYENLIEU);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NGUYENLIEU); }
  
  // Header: Cộng dồn, không theo ngày
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Nguyen lieu', 'Don vi', 'Tong da dung', 'Gia tri', 'Cap nhat']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#4ade80');
    sheet.setFrozenRows(1);
  }
  
  // Tính NL dùng hôm nay từ invoice × recipe
  var invoices = (state.todayInvoices || []).filter(function(inv) {
    return inv.date === today && !inv.cancelled;
  });
  var recipes = state.recipes || {};
  var ingredients = state.ingredients || [];
  
  // Đếm số lượng mỗi món đã bán
  var soldItems = {};
  invoices.forEach(function(inv) {
    (inv.items || []).forEach(function(item) {
      var menuId = String(item.menuId);
      soldItems[menuId] = (soldItems[menuId] || 0) + item.qty;
    });
  });
  
  // Tính NL usage hôm nay
  var todayUsage = {}; // { ingId: qty }
  Object.keys(soldItems).forEach(function(menuId) {
    var recipe = recipes[menuId];
    if (!recipe || !Array.isArray(recipe)) return;
    recipe.forEach(function(r) {
      var ingId = String(r.ingId);
      todayUsage[ingId] = (todayUsage[ingId] || 0) + r.qty * soldItems[menuId];
    });
  });
  
  // Đọc dữ liệu hiện tại trong sheet
  var lastRow = sheet.getLastRow();
  var existingData = {};
  
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    for (var i = 0; i < data.length; i++) {
      var name = data[i][0];
      if (name) {
        existingData[name] = {
          row: i + 2,
          unit: data[i][1],
          qty: data[i][2] || 0,
          cost: data[i][3] || 0
        };
      }
    }
  }
  
  // Cộng dồn hoặc thêm mới
  var totalCost = 0;
  var todayCost = 0;
  
  Object.keys(todayUsage).forEach(function(ingId) {
    var ing = null;
    for (var i = 0; i < ingredients.length; i++) {
      if (String(ingredients[i].id) === ingId) { ing = ingredients[i]; break; }
    }
    if (!ing) return;
    
    var addQty = Math.round(todayUsage[ingId] * 100) / 100;
    var addCost = Math.round(ing.unitPrice * addQty);
    todayCost += addCost;
    
    if (existingData[ing.name]) {
      // Cộng dồn vào dòng cũ
      var row = existingData[ing.name].row;
      var oldQty = existingData[ing.name].qty;
      var oldCost = existingData[ing.name].cost;
      
      var newQty = Math.round((oldQty + addQty) * 100) / 100;
      var newCost = oldCost + addCost;
      
      sheet.getRange(row, 3).setValue(newQty);
      sheet.getRange(row, 4).setValue(newCost);
      sheet.getRange(row, 5).setValue(today);
    } else {
      // Thêm dòng mới
      sheet.appendRow([ing.name, ing.unit, addQty, addCost, today]);
    }
  });
  
  // Sort theo tên
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).sort(1);
  }
  
  // Format number
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).setNumberFormat('#,##0');
  }
  
  Logger.log('Nguyen lieu: chi phi hom nay = ' + todayCost);
  return todayCost;
}

// ── Test thủ công (nếu cần) ──
function testSync() { syncDaily(); }

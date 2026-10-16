(function() {
  'use strict';

  // ==================================================================
  // BASE QR DATA (TallyPay Bangla original)
  // ==================================================================
  const BASE_QR = "00020101021126460008TallyPay01020302041005031691005212644597725204541153030505802BD5914Abdullah store6010Mymensingh62280312ST126445977207080000000163047CAB";

  // ==================================================================
  // EMV TLV PARSER
  // ==================================================================
  function parseTLV(data) {
    const tags = [];
    let i = 0;
    while (i < data.length) {
      if (i + 4 > data.length) break;
      const tag = data.substring(i, i + 2);
      const lenStr = data.substring(i + 2, i + 4);
      const len = parseInt(lenStr, 10);
      if (isNaN(len)) break;
      const value = data.substring(i + 4, i + 4 + len);
      tags.push({ tag, length: len, value });
      i += 4 + len;
    }
    return tags;
  }

  function encodeTLV(tag, value) {
    const len = value.length;
    let lenStr;
    if (len < 100) lenStr = String(len).padStart(2, '0');
    else lenStr = String(len).padStart(3, '0');
    return tag + lenStr + value;
  }

  // ==================================================================
  // CRC-16/CCITT-FALSE
  // ==================================================================
  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= (str.charCodeAt(i) & 0xFF) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  // ==================================================================
  // REBUILD QR WITH AMOUNT
  // ==================================================================
  function buildQRWithAmount(baseData, amount) {
    const crcIndex = baseData.lastIndexOf('6304');
    if (crcIndex === -1) throw new Error('CRC marker not found in base QR');
    const payloadWithoutCRC = baseData.substring(0, crcIndex);

    const tags = parseTLV(payloadWithoutCRC);

    let amountStr = String(amount);
    if (amountStr.includes('.')) {
      const parts = amountStr.split('.');
      const dec = (parts[1] || '').slice(0, 2).padEnd(2, '0');
      amountStr = parts[0] + '.' + dec;
      if (dec === '00') amountStr = parts[0];
    }

    const newTags = [];
    let amountInserted = false;

    for (const t of tags) {
      if (t.tag === '54') {
        newTags.push({ tag: '54', value: amountStr });
        amountInserted = true;
      } else if (t.tag === '53') {
        newTags.push(t);
        if (!amountInserted) {
          newTags.push({ tag: '54', value: amountStr });
          amountInserted = true;
        }
      } else if (t.tag === '58' && !amountInserted) {
        newTags.push({ tag: '54', value: amountStr });
        amountInserted = true;
        newTags.push(t);
      } else {
        newTags.push(t);
      }
    }

    if (!amountInserted) {
      const idx59 = newTags.findIndex(x => x.tag === '59');
      if (idx59 > -1) {
        newTags.splice(idx59, 0, { tag: '54', value: amountStr });
      } else {
        newTags.push({ tag: '54', value: amountStr });
      }
    }

    let newPayload = '';
    for (const t of newTags) {
      newPayload += encodeTLV(t.tag, t.value);
    }

    const beforeCRC = newPayload + '6304';
    const crc = crc16(beforeCRC);
    return beforeCRC + crc;
  }

  // ==================================================================
  // QR IMAGE RENDERER
  // ==================================================================
  function renderQR(text, container) {
    let typeNumber = 0;
    const len = text.length;
    if (len < 20) typeNumber = 1;
    else if (len < 40) typeNumber = 3;
    else if (len < 80) typeNumber = 5;
    else if (len < 150) typeNumber = 8;
    else if (len < 300) typeNumber = 12;
    else typeNumber = 0;

    let qr;
    try {
      qr = qrcode(typeNumber, 'M');
      qr.addData(text);
      qr.make();
    } catch (e) {
      qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
    }

    const moduleCount = qr.getModuleCount();
    const cellSize = 8;
    const margin = 4;
    const size = (moduleCount + margin * 2) * cellSize;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`;
    svg += `<rect width="${size}" height="${size}" fill="#ffffff"/>`;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          const x = (col + margin) * cellSize;
          const y = (row + margin) * cellSize;
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#0a0a0a"/>`;
        }
      }
    }
    svg += `</svg>`;

    container.innerHTML = svg;
    return svg;
  }

  // ==================================================================
  // UI LOGIC
  // ==================================================================
  const amountInput = document.getElementById('amountInput');
  const generateBtn = document.getElementById('generateBtn');
  const resultCard = document.getElementById('resultCard');
  const qrBox = document.getElementById('qrBox');
  const qrAmountDisplay = document.getElementById('qrAmountDisplay');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const errorBox = document.getElementById('errorBox');
  const errorText = document.getElementById('errorText');

  let currentAmount = null;

  function showError(msg) {
    errorText.textContent = msg;
    errorBox.classList.remove('hidden');
    setTimeout(() => errorBox.classList.add('hidden'), 5000);
  }

  function hideError() {
    errorBox.classList.add('hidden');
  }

  function toast(msg, type = 'success') {
    const c = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      setTimeout(() => el.remove(), 320);
    }, 2500);
  }

  function validateAmount(raw) {
    if (!raw) return { ok: false, msg: 'টাকার পরিমাণ লিখুন' };
    const cleaned = raw.trim();
    if (!/^\d{1,9}(\.\d{0,2})?$/.test(cleaned)) {
      return { ok: false, msg: 'শুধু সংখ্যা লিখুন (সর্বোচ্চ ২ দশমিক)' };
    }
    const num = Number(cleaned);
    if (!isFinite(num) || num <= 0) {
      return { ok: false, msg: 'পরিমাণ ০ থেকে বড় হতে হবে' };
    }
    if (num > 999999999) {
      return { ok: false, msg: 'পরিমাণ অনেক বেশি' };
    }
    return { ok: true, value: num, str: cleaned };
  }

  function formatBDT(n) {
    return '৳ ' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ==================================================================
  // GENERATE
  // ==================================================================
  generateBtn.addEventListener('click', generateQR);
  amountInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateQR();
  });
  amountInput.addEventListener('input', () => {
    amountInput.value = amountInput.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    hideError();
  });

  function generateQR() {
    hideError();
    const raw = amountInput.value.trim();
    const v = validateAmount(raw);
    if (!v.ok) {
      showError(v.msg);
      return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span>⏳</span><span>তৈরি হচ্ছে...</span>';

    setTimeout(() => {
      try {
        const newQR = buildQRWithAmount(BASE_QR, v.value);

        if (newQR.length > 500) {
          throw new Error('QR data too long');
        }

        renderQR(newQR, qrBox);
        currentAmount = v.value;

        qrAmountDisplay.textContent = formatBDT(v.value);

        resultCard.classList.remove('hidden');
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        toast('QR সফলভাবে তৈরি হয়েছে', 'success');

        console.log('New QR:', newQR);
      } catch (err) {
        console.error(err);
        showError('QR তৈরি ব্যর্থ: ' + err.message);
        toast('QR তৈরি ব্যর্থ', 'error');
      } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span>🔳</span><span>QR তৈরি করুন</span>';
      }
    }, 150);
  }

  // ==================================================================
  // QUICK AMOUNTS
  // ==================================================================
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.quick;
      hideError();
      generateQR();
    });
  });

  // ==================================================================
  // DOWNLOAD PNG
  // ==================================================================
  downloadBtn.addEventListener('click', () => {
    if (!currentAmount) {
      toast('প্রথমে QR তৈরি করুন', 'error');
      return;
    }

    const scale = 4;
    const svgEl = qrBox.querySelector('svg');
    if (!svgEl) return;

    const baseW = parseInt(svgEl.getAttribute('width'));
    const baseH = parseInt(svgEl.getAttribute('height'));

    const headerH = 90;
    const padding = 30;
    const totalW = baseW * scale + padding * 2;
    const totalH = (baseH + headerH) * scale + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        padding * scale,
        padding * scale,
        baseW * scale,
        baseH * scale
      );

      const textY = padding * scale + baseH * scale + 40 * scale;
      ctx.fillStyle = '#0a0a0a';
      ctx.textAlign = 'center';
      ctx.font = `700 ${28 * scale}px 'Noto Sans Bengali', system-ui, sans-serif`;
      ctx.fillText(formatBDT(currentAmount), totalW / 2, textY);

      ctx.font = `500 ${13 * scale}px 'Noto Sans Bengali', system-ui, sans-serif`;
      ctx.fillStyle = '#737373';
      ctx.fillText(
        'Abdullah Store — TallyPay Bangla',
        totalW / 2,
        textY + 28 * scale
      );

      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = `Abdullah-Store-QR-${currentAmount}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
        toast('QR ডাউনলোড শুরু হয়েছে', 'success');
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('ডাউনলোড ব্যর্থ', 'error');
    };
    img.src = url;
  });

  // ==================================================================
  // RESET
  // ==================================================================
  resetBtn.addEventListener('click', () => {
    resultCard.classList.add('hidden');
    amountInput.value = '';
    amountInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    currentAmount = null;
  });

  // ==================================================================
  // AUTO-FOCUS
  // ==================================================================
  window.addEventListener('load', () => {
    amountInput.focus();
  });

  // ==================================================================
  // TEST HELPER (console এ চালান: __testQR(100))
  // ==================================================================
  window.__testQR = function(amount) {
    const result = buildQRWithAmount(BASE_QR, amount);
    console.log('Amount:', amount);
    console.log('Length:', result.length);
    console.log('Payload:', result);
    console.log('CRC:', result.slice(-4));
    return result;
  };
})();

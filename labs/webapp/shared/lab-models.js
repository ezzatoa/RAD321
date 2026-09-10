/* RAD 321 virtual experiment models & interactive canvas renderers.
   Educational approximations: values show direction and relative magnitude,
   not equipment calibration or patient dose. Plain JavaScript, offline-safe. */
(function (global) {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round = (value, digits) => Number(value).toFixed(digits == null ? 2 : digits);
  const metric = (label, value, unit, meaning) => ({ label, value, unit: unit || '', meaning: meaning || '' });

  function mulberry32(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(Math.min(Math.abs(w) / 2, Math.abs(h) / 2), (typeof r === 'number' ? r : 6));
    if (typeof ctx.roundRect === 'function') {
      try {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        return;
      } catch (e) {}
    }
    if (typeof ctx.quadraticCurveTo === 'function') {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      return;
    }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.closePath();
  }

  // Canvas caption helper: shrink the font until the text fits maxWidth.
  // Prevents simulator labels, pills, and footers overflowing their boxes.
  function setFittedFont(ctx, text, maxWidth, basePx, weight, family) {
    let px = basePx;
    ctx.font = weight + ' ' + px + 'px ' + family;
    try {
      while (px > 7.5 && ctx.measureText(text).width > maxWidth) {
        px -= 0.5;
        ctx.font = weight + ' ' + px + 'px ' + family;
      }
    } catch (e) {}
    return px;
  }

  // Single-line ellipsis: trim with '…' until the text fits maxWidth.
  function fitEllipsis(ctx, text, maxWidth) {
    text = String(text);
    try {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
      return t + '…';
    } catch (e) { return text; }
  }

  // Greedy word-wrap to maxWidth, at most maxLines (last line gets '…' on overflow).
  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    let overflow = false;
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (ctx.measureText(trial).width <= maxWidth) { line = trial; continue; }
      lines.push(line);
      if (lines.length >= maxLines) { overflow = true; line = ''; break; }
      line = word;
    }
    if (line && lines.length < maxLines) lines.push(line);
    else if (line && lines.length >= maxLines) overflow = true;
    if (overflow && lines.length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = last + '…';
    }
    return lines;
  }

  function computeFormation(v) {
    const sod = Math.max(1, v.sid - v.oid);
    const magnification = v.sid / sod;
    const distanceFactor = Math.pow(100 / v.sid, 2);
    const energyFactor = Math.pow(v.kvp / 75, 2.2);
    const penetration = 1 / (1 + Math.exp(-(v.kvp - 68) / 8));
    const receptorSignal = v.mas * energyFactor * distanceFactor * penetration;
    const magPercent = Math.round((magnification - 1) * 100);
    const score = clamp(Math.round(100 - Math.abs(receptorSignal - 12) * 4.5 - (magnification - 1) * 120), 10, 100);

    return {
      metrics: [
        { label: 'SOD', value: round(sod, 1), unit: 'cm', meaning: `SID (${v.sid}) - OID (${v.oid})`, status: sod >= 80 ? 'optimal' : sod >= 50 ? 'acceptable' : 'warning' },
        { label: 'Magnification', value: round(magnification, 3), unit: '×', meaning: `+${magPercent}% enlargement (SID / SOD)`, status: magnification <= 1.1 ? 'optimal' : magnification <= 1.25 ? 'acceptable' : 'warning' },
        { label: 'Distance intensity', value: round(distanceFactor * 100, 1), unit: '% of 100cm', meaning: 'Inverse-square radiation fluence', status: distanceFactor >= 0.7 && distanceFactor <= 1.3 ? 'optimal' : 'acceptable' },
        { label: 'Relative receptor signal', value: round(receptorSignal, 2), unit: 'a.u.', meaning: receptorSignal >= 8 && receptorSignal <= 18 ? 'Target detector fluence' : (receptorSignal < 8 ? 'Underexposure / mottle risk' : 'Elevated receptor fluence'), status: receptorSignal >= 8 && receptorSignal <= 18 ? 'optimal' : 'warning' }
      ],
      score,
      observation: `At ${v.sid} cm SID and ${v.oid} cm OID (SOD = ${round(sod, 1)} cm), projected anatomy is magnified by ${round(magnification, 3)}× (+${magPercent}% enlargement). Receptor beam intensity is ${round(distanceFactor * 100, 1)}% of the 100 cm baseline. ${distanceFactor < 0.6 ? 'Increasing SID significantly reduces intensity, requiring proportional mAs compensation under the direct square law.' : 'Beam geometry and receptor fluence are balanced within standard diagnostic latitude.'}`
    };
  }

  function computeFilm(v) {
    const activity = Math.pow(2, (v.temp - 35) / 5) * (v.time / 90);
    const humidityPenalty = Math.abs(v.humidity - 45) * 0.55;
    const safelightFog = Math.max(0, 120 - v.safelight) * 0.38;
    const processingPenalty = Math.abs(activity - 1) * 42;
    const quality = clamp(Math.round(100 - humidityPenalty - safelightFog - processingPenalty), 10, 100);
    const densityTrend = activity < 0.82 ? 'Underdeveloped / Pale (Low Contrast)' : activity > 1.2 ? 'Overdeveloped / Dark (Chemical Fog)' : 'Balanced Development (Diagnostic)';

    return {
      metrics: [
        { label: 'Developer activity', value: round(activity, 2), unit: 'rel', meaning: densityTrend, status: activity >= 0.85 && activity <= 1.15 ? 'optimal' : 'warning' },
        { label: 'Safelight fog risk', value: round(safelightFog, 1), unit: '%', meaning: v.safelight < 90 ? '⚠️ Lamp too close (Fog risk)' : 'Safe working illumination', status: safelightFog < 5 ? 'optimal' : safelightFog < 18 ? 'acceptable' : 'critical' },
        { label: 'Handling static risk', value: round(humidityPenalty, 1), unit: '%', meaning: v.humidity < 35 ? 'Low humidity (Static tree spark)' : v.humidity > 60 ? 'High humidity (Emulsion stick)' : 'Optimal darkroom humidity', status: humidityPenalty < 6 ? 'optimal' : 'warning' },
        { label: 'Film quality index', value: String(quality), unit: '/100', meaning: quality >= 80 ? 'Optimal diagnostic emulsion' : 'Compromised film chemistry', status: quality >= 80 ? 'optimal' : quality >= 60 ? 'acceptable' : 'warning' }
      ],
      score: quality,
      observation: `At ${v.temp}°C developer temperature and ${v.time}s immersion time, chemical activity is ${round(activity, 2)}× (${densityTrend}). Safelight distance (${v.safelight} cm) presents ${safelightFog > 15 ? 'significant post-exposure fogging risk' : 'safe working darkroom illumination'}. Relative humidity of ${v.humidity}% ${v.humidity < 35 ? 'increases risk of static discharge artifacts' : 'maintains emulsion integrity'}.`
    };
  }

  function computeDensity(v) {
    const speedShift = Math.log10(v.speed / 100);
    const effectiveExposure = v.exposure + speedShift;
    const curve = 1 / (1 + Math.exp(-v.gamma * 2.4 * effectiveExposure));
    const od = v.base + 2.9 * curve;
    const region = curve < 0.2 ? 'Toe (Underexposure / Low Contrast)' : curve > 0.82 ? 'Shoulder (Solarization / Saturation)' : 'Straight-Line Diagnostic Region';
    const latitude = 2.4 / Math.max(0.5, v.gamma);
    const transmitted = Math.pow(10, -od) * 100;
    const score = clamp(Math.round(100 - Math.abs(od - 1.5) * 48), 10, 100);

    return {
      metrics: [
        { label: 'Optical density', value: round(od, 2), unit: 'OD', meaning: `log₁₀(I₀/Iₜ) | Base+Fog: ${round(v.base, 2)}`, status: od >= 1.0 && od <= 2.2 ? 'optimal' : (od >= 0.5 && od <= 2.8 ? 'acceptable' : 'warning') },
        { label: 'Curve region', value: region.split('(')[0].trim(), unit: '', meaning: region, status: region.includes('Straight-Line') ? 'optimal' : 'warning' },
        { label: 'Relative latitude', value: round(latitude, 2), unit: 'log E', meaning: `Gamma γ=${round(v.gamma, 1)} (${latitude < 1.0 ? 'Narrow latitude / High contrast' : 'Wide latitude'})`, status: 'optimal' },
        { label: 'Transmitted light', value: round(transmitted, 2), unit: '%', meaning: `${round(transmitted, 2)}% of viewbox light transmitted`, status: od >= 1.0 && od <= 2.2 ? 'optimal' : 'acceptable' }
      ],
      score,
      observation: `Selected exposure places film response in the ${region} with net OD ${round(od, 2)} (${round(transmitted, 2)}% viewbox light transmitted). Film gamma γ=${round(v.gamma, 1)} provides ${latitude < 1.0 ? 'steep high-contrast response with narrow latitude' : 'wide exposure latitude with lower contrast scale'}. Speed ${v.speed} shifts the H&D curve ${speedShift >= 0 ? '+' : ''}${round(speedShift, 2)} log E.`
    };
  }

  function computeContrast(v) {
    const energy = v.kvp / 80;
    const muSoft = 0.055 / Math.pow(energy, 1.4);
    const muDense = 0.075 / Math.pow(energy, 1.4);
    const softSignal = Math.exp(-muSoft * v.thickness);
    const denseSignal = Math.exp(-muDense * v.thickness);
    const subjectContrast = Math.abs(softSignal - denseSignal) / Math.max(0.001, softSignal);
    const displayGain = v.receptor * (0.65 + v.digital / 100);
    const displayedContrast = clamp(subjectContrast * displayGain * 100, 0, 100);
    const scale = displayedContrast > 48 ? 'Short scale (High contrast / Extremity bone)' : displayedContrast > 28 ? 'Moderate scale (Standard diagnostic)' : 'Long scale (Low contrast / Wide latitude chest)';
    const score = clamp(Math.round(100 - Math.abs(displayedContrast - 45) * 1.2), 10, 100);

    return {
      metrics: [
        { label: 'Subject contrast', value: round(subjectContrast * 100, 1), unit: '%', meaning: `Differential attenuation at ${v.kvp} kVp`, status: subjectContrast >= 0.30 ? 'optimal' : 'acceptable' },
        { label: 'Displayed contrast', value: round(displayedContrast, 1), unit: '%', meaning: `After receptor (${round(v.receptor, 1)}×) & digital LUT (${v.digital}%)`, status: displayedContrast >= 30 && displayedContrast <= 65 ? 'optimal' : 'acceptable' },
        { label: 'Remnant transmission', value: round(softSignal * 100, 1), unit: '%', meaning: `Soft tissue penetration (${v.thickness} cm thickness)`, status: 'optimal' },
        { label: 'Contrast scale', value: scale.split('(')[0].trim(), unit: '', meaning: scale, status: 'optimal' }
      ],
      score,
      observation: `At ${v.kvp} kVp and ${v.thickness} cm tissue thickness, differential photoelectric absorption yields ${round(subjectContrast * 100, 1)}% subject contrast. Receptor gamma and digital processing produce ${scale} (${round(displayedContrast, 1)}% displayed contrast). Lowering kVp increases subject contrast at the cost of higher patient skin dose.`
    };
  }

  function computeSharpness(v) {
    const sod = Math.max(1, v.sid - v.oid);
    const magnification = v.sid / sod;
    const unsharpness = v.focal * v.oid / sod;
    const geometricLimit = unsharpness < 0.02 ? 8 : 1 / Math.max(0.04, 2 * unsharpness);
    const visibility = clamp(100 * geometricLimit / Math.max(v.freq, geometricLimit), 0, 100);
    const score = clamp(Math.round(visibility), 10, 100);

    return {
      metrics: [
        { label: 'Magnification', value: round(magnification, 3), unit: '×', meaning: `SID (${v.sid}) / SOD (${sod})`, status: magnification <= 1.1 ? 'optimal' : 'warning' },
        { label: 'Focal spot blur (Ug)', value: round(unsharpness, 3), unit: 'mm', meaning: `Penumbra = F (${v.focal}mm) × OID / SOD`, status: unsharpness <= 0.15 ? 'optimal' : unsharpness <= 0.35 ? 'acceptable' : 'warning' },
        { label: 'Resolution limit', value: round(geometricLimit, 2), unit: 'lp/mm', meaning: 'Geometric sampling limit (1 / 2Ug)', status: geometricLimit >= 4.0 ? 'optimal' : geometricLimit >= 2.5 ? 'acceptable' : 'warning' },
        { label: 'Target pattern visibility', value: round(visibility, 0), unit: '%', meaning: `${v.freq} lp/mm spatial test pattern`, status: visibility >= 75 ? 'optimal' : visibility >= 45 ? 'acceptable' : 'critical' }
      ],
      score,
      observation: `At ${v.focal} mm focal spot and ${v.oid} cm OID (SOD = ${sod} cm), focal spot blur is Ug = ${round(unsharpness, 3)} mm, establishing a geometric resolution limit of ~${round(geometricLimit, 2)} lp/mm. The ${v.freq} lp/mm test pattern is ${visibility >= 75 ? 'crisply resolved with sharp cortical margins' : visibility >= 45 ? 'partly resolved with visible penumbra unsharpness' : 'unresolved due to focal spot penumbra overlap'}.`
    };
  }

  function computeDistortion(v) {
    const partAngle = Number(v.part) || 0; // degrees (>0 = CW tilt, <0 = CCW tilt)
    const offsetCm = Number(v.offset) || 0;// lateral displacement from CR (cm)
    const oid = Number(v.oid) || 15;       // OID (cm)
    const sid = Number(v.sid) || 100;      // SID (cm)
    const sod = Math.max(10, sid - oid);
    const mag = sid / sod;
    const l0 = 100; // true object length (mm)
    const lNorm = l0 * mag; // baseline un-distorted length (mm)

    // Ray divergence angle at lateral offset (CR is fixed perpendicular = 0°)
    const thetaRay = (Math.atan(offsetCm / sod) * 180) / Math.PI;
    const relPartAngle = partAngle + thetaRay;

    // Projected shape factor with fixed perpendicular beam
    const cosRel = Math.cos((relPartAngle * Math.PI) / 180);
    const cosDivergence = Math.cos((thetaRay * Math.PI) / 180);
    const shapeFactor = clamp(cosRel / Math.max(0.2, cosDivergence * cosDivergence), 0.4, 2.5);

    const lProj = lNorm * shapeFactor;
    const deltaL = lProj - lNorm;

    const isShort = shapeFactor < 0.985;
    const isElong = shapeFactor > 1.015;
    const label = isShort
      ? 'Foreshortening (Anatomical tilt compounds with beam angle)'
      : isElong
        ? 'Elongation (Divergent beam obliquity from off-centering)'
        : 'Minimal distortion (True isometric projection)';

    const distortionIndex = clamp(Math.abs(shapeFactor - 1) * 100 + Math.abs(thetaRay) * 0.5, 0, 100);
    const score = clamp(Math.round(100 - distortionIndex), 10, 100);

    return {
      metrics: [
        { label: 'Part tilt', value: round(partAngle, 1), unit: '°', meaning: partAngle === 0 ? 'Parallel to IR (True AP)' : (partAngle > 0 ? 'Clockwise tilt (+°)' : 'Counter-clockwise tilt (-°)'), status: Math.abs(partAngle) <= 5 ? 'optimal' : 'warning' },
        { label: 'Beam divergence', value: round(Math.abs(thetaRay), 1), unit: '°', meaning: `Ray angle at lateral offset ${offsetCm > 0 ? '+' : ''}${offsetCm} cm`, status: Math.abs(thetaRay) <= 4 ? 'optimal' : 'warning' },
        { label: 'Projected length', value: round(lProj, 1), unit: 'mm', meaning: `Normal: ${round(lNorm, 1)} mm (Δ ${deltaL >= 0 ? '+' : ''}${round(deltaL, 1)} mm)`, status: Math.abs(deltaL) <= 3 ? 'optimal' : 'warning' },
        { label: 'Shape factor', value: round(shapeFactor, 3), unit: '×', meaning: `OID ${oid}cm, SID ${sid}cm (M=${round(mag, 2)}×)`, status: Math.abs(shapeFactor - 1) <= 0.03 ? 'optimal' : 'warning' }
      ],
      score,
      observation: `Ray-traced cast shadow is ${round(lProj, 1)} mm vs baseline ${round(lNorm, 1)} mm (Shape factor: ${round(shapeFactor, 3)}×, ΔL = ${deltaL >= 0 ? '+' : ''}${round(deltaL, 1)} mm at SID ${sid} cm, OID ${oid} cm). Diagnostic geometry confirms ${label}.`
    };
  }

  function computeScatter(v) {
    const fieldArea = Math.pow(v.field / 20, 2);
    const thicknessFactor = Math.pow(v.thickness / 18, 1.4);
    const energyFactor = 0.75 + (v.kVp - 50) / 120;
    const sprBefore = clamp(0.12 * fieldArea * thicknessFactor * energyFactor, 0.03, 2.5);
    const scatterTransmission = v.grid === 0 ? 1 : 1 / (1 + v.grid * 0.12);
    const sprAfter = sprBefore * scatterTransmission;
    const contrastImprovement = (1 + sprBefore) / (1 + sprAfter);
    const buckyFactor = v.grid === 0 ? 1 : 1 + v.grid * 0.32;
    const score = clamp(Math.round(100 / (1 + sprAfter * 1.5)), 10, 100);

    return {
      metrics: [
        { label: 'Incident SPR (Pre-grid)', value: round(sprBefore, 2), unit: '', meaning: `Scatter burden from ${v.field}×${v.field}cm field & ${v.thickness}cm tissue`, status: sprBefore < 0.5 ? 'optimal' : 'warning' },
        { label: 'Residual SPR (At detector)', value: round(sprAfter, 2), unit: '', meaning: v.grid === 0 ? 'No grid (Scatter fog reaches receptor)' : `${v.grid}:1 grid cleanup active`, status: sprAfter < 0.3 ? 'optimal' : sprAfter < 0.6 ? 'acceptable' : 'warning' },
        { label: 'Contrast improvement (CIF)', value: round(contrastImprovement, 2), unit: '×', meaning: 'Grid contrast improvement factor (k)', status: contrastImprovement >= 1.5 ? 'optimal' : 'acceptable' },
        { label: 'Bucky factor', value: round(buckyFactor, 2), unit: '×', meaning: `mAs multiplier required for dose compensation`, status: buckyFactor <= 2.5 ? 'optimal' : 'warning' }
      ],
      score,
      observation: `A ${v.field}×${v.field} cm field on ${v.thickness} cm tissue produces an unattenuated SPR of ${round(sprBefore, 2)}. ${v.grid === 0 ? 'Without a grid, scatter fog degrades radiographic contrast across the image.' : `An ${v.grid}:1 grid reduces residual scatter to SPR ${round(sprAfter, 2)} (Contrast Improvement Factor: ${round(contrastImprovement, 2)}×, Bucky Factor: ${round(buckyFactor, 2)}×). Technique must be compensated accordingly under ALARA.`}`
    };
  }

  function computeNoise(v) {
    const detectedQuanta = Math.max(1, v.mas * 850 * v.detector);
    const quantumSd = v.signal / Math.sqrt(detectedQuanta / 25);
    const totalSd = Math.sqrt(quantumSd * quantumSd + v.intrinsic * v.intrinsic);
    const snr = v.signal / totalSd;
    const cnr = (v.signal * 0.18) / totalSd;
    const dominant = quantumSd > v.intrinsic ? 'Quantum noise dominates (Photon starvation)' : 'Intrinsic detector noise dominates';
    const score = clamp(Math.round(snr * 6.5), 10, 100);

    return {
      metrics: [
        { label: 'Detected quanta index', value: round(detectedQuanta, 0), unit: 'a.u.', meaning: `mAs (${v.mas}) × DQE (${round(v.detector * 100, 0)}%)`, status: detectedQuanta >= 4000 ? 'optimal' : 'acceptable' },
        { label: 'Total noise SD (σ)', value: round(totalSd, 2), unit: 'a.u.', meaning: dominant, status: totalSd <= 6 ? 'optimal' : totalSd <= 14 ? 'acceptable' : 'warning' },
        { label: 'Signal-to-Noise (SNR)', value: round(snr, 2), unit: '', meaning: `Mean signal (${v.signal}) / Total noise (σ)`, status: snr >= 15 ? 'optimal' : snr >= 8 ? 'acceptable' : 'warning' },
        { label: 'Contrast-to-Noise (CNR)', value: round(cnr, 2), unit: '', meaning: cnr >= 2.5 ? 'Rose criterion MET (Confident detection)' : 'Sub-threshold conspicuity (Mottle blur)', status: cnr >= 2.5 ? 'optimal' : 'warning' }
      ],
      score,
      observation: `Detected photon fluence yields total noise σ=${round(totalSd, 2)} (${dominant}). SNR is ${round(snr, 2)} and lesion CNR is ${round(cnr, 2)} (${cnr >= 2.5 ? 'satisfies Rose criterion for confident lesion detection' : 'sub-threshold lesion conspicuity due to quantum mottle'}). Increasing mAs or utilizing higher DQE detectors preserves diagnostic image quality.`
    };
  }

  function computeFluoro(v) {
    const d0 = 23; // baseline input field (cm)
    const din = Math.max(9, Math.min(40, Number(v.field) || 23));
    const dout = 2.5; // standard output phosphor diameter (cm)
    const magFactor = d0 / din;
    const minificationGain = Math.pow(din / dout, 2);
    const fluxGain = 60;
    const totalBrightnessGain = minificationGain * fluxGain;
    const patientDoseRate = Math.pow(d0 / din, 2);
    const distanceFactor = 1 / Math.pow(Math.max(0.5, Number(v.distance) || 2), 2);
    const shieldTransmission = (100 - clamp(Number(v.shield) || 0, 0, 100)) / 100;
    const timeNorm = (Number(v.time) || 5) / 5;
    const operatorDose = timeNorm * patientDoseRate * distanceFactor * shieldTransmission;
    const spatialResolution = 2.0 * (d0 / din);
    const distReduction = (1 - distanceFactor) * 100;
    const score = clamp(Math.round(100 - operatorDose * 14 - (patientDoseRate - 1) * 8), 10, 100);

    return {
      metrics: [
        { label: 'Magnification ratio', value: round(magFactor, 2), unit: '×', meaning: `Input field ${din} cm (Baseline 23 cm)`, status: din >= 23 ? 'optimal' : 'acceptable' },
        { label: 'Patient ESE dose rate', value: round(patientDoseRate, 2), unit: '× baseline', meaning: din < 23 ? `ABC ramps tube current by ${round(patientDoseRate, 2)}×` : 'Standard normal mode dose rate', status: patientDoseRate <= 1.1 ? 'optimal' : patientDoseRate <= 2.2 ? 'acceptable' : 'warning' },
        { label: 'Brightness gain', value: String(Math.round(totalBrightnessGain)), unit: '', meaning: `Minification (${round(minificationGain, 1)}×) × Flux (60×)`, status: 'optimal' },
        { label: 'Operator scatter dose', value: round(operatorDose, 3), unit: 'rel', meaning: `Time (${v.time}m) × Inv-Sq (${v.distance}m) × Shield (${v.shield}%)`, status: operatorDose <= 0.2 ? 'optimal' : operatorDose <= 0.6 ? 'acceptable' : 'warning' }
      ],
      score,
      observation: din < 23
        ? `In Magnification Mode (${din} cm FOV, ${round(magFactor, 2)}×), ABC feedback automatically ramps tube output up ${round(patientDoseRate, 2)}× baseline to compensate for reduced minification gain (${round(minificationGain, 1)}×). Resolution improves to ~${round(spatialResolution, 1)} lp/mm. Staff scatter dose (${round(operatorDose, 3)} rel) is controlled by ${v.distance} m distance (${round(distReduction, 0)}% inverse-square reduction) and ${v.shield}% lead shielding.`
        : `In Standard Mode (${din} cm FOV, 1.00×), patient ESE rate is minimized at baseline (1.00×) with total brightness gain of ${Math.round(totalBrightnessGain)}×. Staff scatter exposure (${round(operatorDose, 3)} rel) meets ALARA guidelines.`
    };
  }

  function computeDigital(v) {
    const detectorPitch = Number(v.pitch);
    const matrixSize = Math.max(1, Number(v.matrix));
    const fovCm = Number(v.fov);
    const fovMm = fovCm * 10;
    const matrixPitch = fovMm / matrixSize;
    const effectivePitch = Math.max(detectorPitch, matrixPitch);
    const samplingFreq = 1 / effectivePitch;
    const nyquist = samplingFreq / 2; // f_N in lp/mm

    const recMode = Math.round(v.receptor);
    let recName = 'Indirect DR (CsI:Tl + a-Si)';
    let recCategory = 'Indirect DR';
    let recMechanism = 'CsI needle scintillator + a-Si photodiode + TFT array';
    let mtfFactor = 0.85; // MTF retention factor at Nyquist due to conversion blur
    let fillFactor = clamp(Math.round((1.0 - 0.038 / detectorPitch) * 100), 50, 88);
    let blurNote = 'Structured CsI needles channel light; minor lateral spread before a-Si photodiode absorption.';

    if (recMode === 0) {
      recName = 'CR (PSP BaFBr:Eu²⁺)';
      recCategory = 'CR';
      recMechanism = 'Photostimulable phosphor plate + laser readout scanner';
      mtfFactor = 0.70;
      fillFactor = 100; // Continuous phosphor sheet; laser spot defines readout aperture
      blurNote = 'Laser beam scattering in turbid phosphor crystals causes optical diffusion blur and lower MTF.';
    } else if (recMode >= 2) {
      recName = 'Direct DR (a-Se Photoconductor)';
      recCategory = 'Direct DR';
      recMechanism = 'Amorphous Selenium (a-Se) + high-voltage electrostatic TFT';
      mtfFactor = 0.95;
      fillFactor = clamp(Math.round((1.0 - 0.032 / detectorPitch) * 100), 55, 92);
      blurNote = 'High-voltage electric field pulls charges vertically with zero light spread; highest intrinsic resolution.';
    }

    const effectiveResolution = nyquist * mtfFactor; // Limiting spatial resolution at ~10% MTF
    const minResolvableSize = 1 / (2 * Math.max(0.01, effectiveResolution)); // in mm (Δx)

    let bottleneck = 'Matched Nyquist Sampling';
    let bottleneckHint = 'Acquisition matrix and detector DEL pitch are well-balanced for spatial sampling.';
    if (matrixPitch > detectorPitch * 1.15) {
      bottleneck = 'Matrix-limited (Pixel Size > DEL Pitch)';
      bottleneckHint = `Image detail is constrained by matrix size (${matrixSize} px) across ${fovCm} cm FOV. Increase matrix to unlock detector resolving power.`;
    } else if (detectorPitch > matrixPitch * 1.15) {
      bottleneck = 'Detector-limited (DEL Pitch > Pixel Size)';
      bottleneckHint = `Physical detector DEL pitch (${round(detectorPitch * 1000, 0)} µm) is the resolution bottleneck. Finer matrix provides empty magnification.`;
    }
    const score = clamp(Math.round(effectiveResolution * 18), 15, 100);

    return {
      metrics: [
        { label: 'Receptor Technology', value: recName, unit: '', meaning: recMechanism, status: 'optimal' },
        { label: 'Matrix-Derived Pixel', value: round(matrixPitch, 3), unit: 'mm', meaning: `${round(matrixPitch * 1000, 0)} µm — FOV / Matrix (${fovMm} mm / ${matrixSize})`, status: 'optimal' },
        { label: 'Effective Sampling Pitch', value: round(effectivePitch, 3), unit: 'mm', meaning: `${round(effectivePitch * 1000, 0)} µm — max(DEL Pitch, Matrix Pixel)`, status: effectivePitch <= 0.12 ? 'optimal' : 'acceptable' },
        { label: 'Nyquist Limit (f_N)', value: round(nyquist, 2), unit: 'lp/mm', meaning: `Theoretical sampling ceiling: 1 / (2 × ${round(effectivePitch, 3)} mm)`, status: nyquist >= 4.0 ? 'optimal' : 'acceptable' },
        { label: 'Limiting Spatial Resolution', value: round(effectiveResolution, 2), unit: 'lp/mm', meaning: `10% MTF threshold (${Math.round(mtfFactor * 100)}% of Nyquist limit)`, status: effectiveResolution >= 3.5 ? 'optimal' : 'acceptable' },
        { label: 'Min Resolvable Feature (Δx)', value: round(minResolvableSize * 1000, 0), unit: 'µm', meaning: `Smallest line pair width: 1 / (2 × ${round(effectiveResolution, 2)} lp/mm)`, status: 'optimal' },
        { label: 'DEL Fill Factor', value: `${fillFactor}%`, unit: '', meaning: recMode === 0 ? 'Continuous plate (laser sampled pixel)' : 'Active radiation-sensing area ratio', status: 'optimal' },
        { label: 'Sampling Bottleneck', value: bottleneck, unit: '', meaning: bottleneckHint, status: bottleneck.includes('Matched') ? 'optimal' : 'acceptable' }
      ],
      score,
      observation: `${recName}: Effective sampling pitch of ${round(effectivePitch * 1000, 0)} µm establishes a Nyquist cutoff of ${round(nyquist, 2)} lp/mm and limiting resolution of ~${round(effectiveResolution, 2)} lp/mm (resolving features down to ${round(minResolvableSize * 1000, 0)} µm). ${blurNote} ${bottleneckHint}`
    };
  }

  function computeWindow(v) {
    const ww = Math.max(10, Number(v.width) || 400);
    const wl = Number(v.level) || 40;
    const ei = Math.max(10, Number(v.exposure) || 100);
    const rawNoise = Math.max(0, Number(v.noise) || 8);

    const low = wl - ww / 2;
    const high = wl + ww / 2;
    const contrastGain = 255 / ww; // Display grayscale levels per HU

    // Standard IEC Deviation Index: DI = 10 * log10(EI / EI_Target), where EI_Target = 100
    const targetEI = 100;
    const di = 10 * Math.log10(ei / targetEI);

    // Quantum noise scales inversely with sqrt(EI); auto-rescaling amplifies quantum mottle
    const quantumNoiseComponent = 16 * Math.sqrt(targetEI / ei);
    const effNoise = Math.sqrt(rawNoise * rawNoise + quantumNoiseComponent * quantumNoiseComponent);

    // Subtle low-contrast lesion (+65 HU vs soft tissue +45 HU -> delta HU = 20)
    let lesionGrayDiff = 0;
    const bgHU = 45;
    const lesionHU = 65;
    const bgGray = clamp(((bgHU - low) / ww) * 255, 0, 255);
    const lesionGray = clamp(((lesionHU - low) / ww) * 255, 0, 255);
    lesionGrayDiff = Math.abs(lesionGray - bgGray);

    const lesionCNR = lesionGrayDiff / Math.max(1, effNoise * 0.45);

    // Anatomical structure clipping evaluation
    const lungVisible = low < -400 && high > -750;
    const softTissueVisible = low < 50 && high > 30;
    const boneVisible = high > 600 && low < 950;

    let doseStatus = 'Target ALARA exposure';
    if (di > 3.0) doseStatus = '⚠️ Excessive dose creep (>+3.0 DI)';
    else if (di > 1.0) doseStatus = '⚠️ Dose creep (+1 to +3 DI) — Masked by rescaling';
    else if (di < -3.0) doseStatus = '⚠️ Severe underexposure noise (<-3.0 DI)';
    else if (di < -1.0) doseStatus = '⚠️ Quantum mottle (-1 to -3 DI)';

    let noiseQualityDesc = 'Low noise (Crisp)';
    if (effNoise > 26) noiseQualityDesc = 'Severe mottle / High noise';
    else if (effNoise > 18) noiseQualityDesc = 'Noticeable quantum grain';
    else if (effNoise > 12) noiseQualityDesc = 'Standard clinical noise';

    const qualityScore = clamp(
      Math.round(55 + Math.min(30, lesionCNR * 5) - Math.abs(di) * 9 - (low > 0 && high > 900 ? 25 : high < 100 ? 30 : 0) + (softTissueVisible ? 10 : 0)),
      10,
      100
    );

    return {
      metrics: [
        { label: 'Display range', value: `${round(low, 0)} to ${round(high, 0)}`, unit: 'HU', meaning: `Level (${wl}) ± Width/2 (${Math.round(ww/2)})`, status: 'optimal' },
        { label: 'Contrast gain (LUT slope)', value: round(contrastGain, 3), unit: 'gray/HU', meaning: ww < 250 ? 'High contrast (Narrow)' : ww > 800 ? 'Wide latitude' : 'Standard diagnostic gradient', status: ww >= 250 && ww <= 800 ? 'optimal' : 'acceptable' },
        { label: 'Effective noise & mottle', value: round(effNoise, 1), unit: 'SD', meaning: `${noiseQualityDesc} (σ_eff)`, status: effNoise <= 14 ? 'optimal' : effNoise <= 22 ? 'acceptable' : 'warning' },
        { label: 'Subtle lesion CNR', value: round(lesionCNR, 2), unit: '', meaning: lesionCNR >= 4.5 ? 'Rose criterion MET (Crisp conspicuity)' : lesionCNR >= 2.5 ? 'Marginal conspicuity' : 'Obscured by quantum mottle', status: lesionCNR >= 4.0 ? 'optimal' : lesionCNR >= 2.0 ? 'acceptable' : 'critical' },
        { label: 'Deviation Index (DI)', value: `${di >= 0 ? '+' : ''}${round(di, 2)}`, unit: 'DI', meaning: doseStatus, status: Math.abs(di) <= 1.0 ? 'optimal' : (Math.abs(di) <= 3.0 ? 'warning' : 'critical') }
      ],
      score: qualityScore,
      observation: `Window [${round(low, 0)} to ${round(high, 0)} HU] provides ${round(contrastGain, 2)} gray/HU contrast gain. Exposure Index is ${ei} (${di >= 0 ? '+' : ''}${round(di, 2)} DI, σ=${round(effNoise, 1)} SD). ${di > 1.0 ? `⚠️ DI ${di >= 0 ? '+' : ''}${round(di, 2)} indicates dose creep masked by digital rescaling.` : di < -1.0 ? `⚠️ DI ${round(di, 2)} indicates quantum mottle from photon starvation.` : 'Target ALARA exposure achieved.'} Lesion CNR is ${round(lesionCNR, 2)} (${lesionCNR >= 4.0 ? 'Rose criterion met' : 'sub-threshold visibility'}).`
    };
  }

  function computeImageRecord(v) {
    const sid = Number(v.sid || 100);
    const kvp = Number(v.kvp || 70);
    const mas = Number(v.mas || 8);
    const focal = Number(v.focal || 0); // 0 = Small (0.6mm), 1 = Large (1.2mm)
    const grid = Number(v.grid || 0);   // 0 = Tabletop Non-Grid DR, 1 = Table Bucky 8:1 Grid DR
    const idCheck = Number(v.idCheck !== undefined ? v.idCheck : 1); // 0 = Incomplete, 1 = Verified 2-ID
    const rotation = Number(v.rotation !== undefined ? v.rotation : 0); // -1 = Int 15°, 0 = True AP 0°, 1 = Ext 15°
    const artifact = Number(v.artifact !== undefined ? v.artifact : 0); // 0 = Clean, 1 = Metal Zipper/Brace
    const motion = Number(v.motion !== undefined ? v.motion : 0);     // 0 = Supported, 1 = Tremor/Motion
    const centering = Number(v.centering !== undefined ? v.centering : 0); // -3 to +3 cm
    let colMode = Number(v.collimation !== undefined ? v.collimation : 1);
    if (colMode > 3) colMode = colMode >= 70 ? 1 : 3; // Backward compat for percentage values
    const marker = Number(v.marker !== undefined ? v.marker : 0); // 0 = Lateral R, 1 = On Joint, 2 = Missing

    // --- STAGE I: Initial Patient & System Setup ---
    const sidPenalty = Math.abs(sid - 100) * 1.6;
    const sidScore = clamp(100 - sidPenalty, 0, 100);
    // Tabletop Non-Grid (<10cm) vs Table Bucky Grid (>10cm) are both valid setups for AP knee,
    // but Table Bucky has a Bucky factor of 3.5 requiring higher mAs in Stage M.
    const gridSetupScore = 100; 
    const stageIScore = idCheck === 0 ? 25 : clamp(sidScore * 0.50 + gridSetupScore * 0.50, 0, 100);

    // --- STAGE M: Manual Selection of Exposure Factors ---
    // kVp penetration (optimal 68-72 kVp for knee subject contrast)
    const kvpScore = clamp(100 - Math.abs(kvp - 70) * 3.8, 0, 100);
    // Exposure Index & Deviation Index
    // Table Bucky 8:1 Grid absorbs scatter and primary beam (Bucky factor = 3.5 -> transmission 0.285)
    const gridTransmission = grid === 1 ? 0.285 : 1.0;
    const receptorSignal = mas * Math.pow(kvp / 70, 2.2) * Math.pow(100 / sid, 2) * gridTransmission;
    const ei = Math.round(200 * (receptorSignal / 8));
    const di = round(10 * Math.log10(Math.max(0.05, ei / 200)), 2);
    const diNum = Number(di);
    const masScore = clamp(100 - Math.abs(diNum) * 22, 0, 100);
    // Focal Spot: Small (0.6mm) is optimal for high spatial resolution of trabecular bone
    const focalScore = focal === 0 ? 100 : 70;
    const stageMScore = clamp(kvpScore * 0.40 + masScore * 0.45 + focalScore * 0.15, 0, 100);

    // --- STAGE A: Anatomy Positioning & Preparation ---
    const rotScore = rotation === 0 ? 100 : (rotation === -1 ? 55 : 40); // True AP vs Int/Ext rotation
    const artScore = artifact === 0 ? 100 : 0; // Metallic zipper/brace artifact is immediate defect
    const motionScore = motion === 0 ? 100 : 25; // Immobilized vs tremor motion
    const stageAScore = clamp(rotScore * 0.40 + artScore * 0.35 + motionScore * 0.25, 0, 100);

    // --- STAGE G: Guide the Beam & Patient ---
    const centeringScore = clamp(100 - Math.abs(centering) * 28, 0, 100);
    // Collimation field areas: 0=10x12cm (cuts anatomy), 1=18x24cm (optimal), 2=24x30cm (moderate), 3=35x43cm (wide open)
    const colScore = colMode === 1 ? 100 : (colMode === 0 ? 25 : (colMode === 2 ? 70 : 35));
    const markerScore = marker === 0 ? 100 : (marker === 1 ? 30 : 0);
    const stageGScore = clamp(centeringScore * 0.30 + colScore * 0.40 + markerScore * 0.30, 0, 100);

    // --- Physical Diagnostics ---
    const oid = 6; // cm
    const sod = Math.max(10, sid - oid);
    const fss = focal === 0 ? 0.6 : 1.2; // mm
    const ug = round(fss * (oid / sod), 2); // mm geometric penumbra
    const um = motion === 1 ? 1.4 : 0.0;   // mm motion blur
    const ut = round(Math.sqrt(Math.pow(Number(ug), 2) + Math.pow(um, 2)), 2); // total blur in mm

    const fieldAreas = [120, 432, 720, 1505];
    const fieldArea = fieldAreas[colMode] || 432;
    // 8:1 Grid cleans scatter dramatically (drops baseline scatter ratio from 0.35 to 0.10)
    const spRatio = round((grid === 1 ? 0.10 : 0.35) * (fieldArea / 432) * Math.pow(kvp / 70, 0.8), 2);
    const noiseSD = round(11.5 / Math.sqrt(Math.max(0.15, ei / 200)), 1);

    // --- Critical Gating & Composite Readiness ---
    let composite = stageIScore * 0.20 + stageMScore * 0.25 + stageAScore * 0.25 + stageGScore * 0.30;
    let criticalWarning = null;
    if (idCheck === 0) {
      composite = Math.min(composite, 45);
      criticalWarning = 'CRITICAL: Patient identification unverified — safety violation';
    } else if (marker === 2) {
      composite = Math.min(composite, 55);
      criticalWarning = 'CRITICAL: Missing lead anatomical side marker';
    } else if (artifact === 1) {
      composite = Math.min(composite, 45);
      criticalWarning = 'CRITICAL: Radiopaque foreign object (metal zipper/brace) obscuring anatomy';
    } else if (colMode === 0) {
      composite = Math.min(composite, 48);
      criticalWarning = 'CRITICAL: Over-collimation clipping tibial plateau / fibular head';
    } else if (motion === 1) {
      composite = Math.min(composite, 62);
      criticalWarning = 'SUBOPTIMAL: Patient motion tremor causing diagnostic unsharpness (Ut=1.40mm)';
    } else if (Math.abs(diNum) > 2.5) {
      composite = Math.min(composite, 60);
      criticalWarning = diNum > 2.5 ? 'SUBOPTIMAL: Excessive overexposure (ALARA dose creep)' : (grid === 1 && mas < 20 ? 'CRITICAL: Underexposed in Bucky grid (increase mAs by ~3.5x)' : 'CRITICAL: Severe photon starvation (quantum mottle)');
    }

    const stages = [
      ['[I] Setup & ID', stageIScore],
      ['[M] Exposure Factors', stageMScore],
      ['[A] Anatomy & Prep', stageAScore],
      ['[G] Beam Guidance', stageGScore]
    ].sort((a, b) => a[1] - b[1]);

    const weakest = stages[0];
    const disposition = composite >= 85 ? 'Diagnostic Exposure Ready' : (composite >= 65 ? 'Suboptimal Setup — Review Weakest Stage' : 'Critical Defect — Repeat Inevitable');

    return {
      score: clamp(Math.round(composite), 0, 100),
      metrics: [
        {
          label: '[I] Setup & ID',
          value: `${Math.round(stageIScore)}`,
          unit: '/100',
          meaning: idCheck === 0 ? '❌ Incomplete ID' : (grid === 0 ? 'Tabletop Non-Grid' : 'Table Bucky 8:1 Grid'),
          status: stageIScore >= 80 ? 'optimal' : 'critical'
        },
        {
          label: '[M] Exposure (EI / DI)',
          value: `${ei} (${diNum >= 0 ? '+' : ''}${di} DI)`,
          unit: '',
          meaning: `FSS: ${focal === 0 ? '0.6mm Small' : '1.2mm Large'}, Noise: σ=${noiseSD}%`,
          status: Math.abs(diNum) <= 1.0 ? 'optimal' : (Math.abs(diNum) <= 2.5 ? 'acceptable' : 'warning')
        },
        {
          label: '[A] Anatomy & Prep',
          value: `${Math.round(stageAScore)}`,
          unit: '/100',
          meaning: artifact === 1 ? '⚠️ Metal Zipper Artifact' : (motion === 1 ? '⚠️ Tremor Motion Blur' : (rotation === 0 ? 'True AP (0°)' : `${rotation > 0 ? '+15° Ext' : '-15° Int'}`)),
          status: stageAScore >= 80 ? 'optimal' : (stageAScore >= 50 ? 'acceptable' : 'warning')
        },
        {
          label: '[G] Beam Guidance',
          value: `${Math.round(stageGScore)}`,
          unit: '/100',
          meaning: marker === 2 ? '❌ Missing Marker' : (colMode === 1 ? 'Tight 18×24cm' : (colMode === 0 ? '⚠️ Clipped' : 'Wide-Open')),
          status: stageGScore >= 80 ? 'optimal' : (stageGScore >= 50 ? 'acceptable' : 'warning')
        },
        {
          label: 'Total Blur (Ut)',
          value: `${ut}`,
          unit: 'mm',
          meaning: `Ug: ${ug} mm (${focal === 0 ? 'Small' : 'Large'} FSS), Um: ${um} mm`,
          status: ut <= 0.15 ? 'optimal' : (ut <= 0.4 ? 'acceptable' : 'warning')
        },
        {
          label: 'Scatter Ratio (S/P)',
          value: `${spRatio}`,
          unit: '',
          meaning: grid === 1 ? '8:1 Grid Cleaned (Low Scatter)' : (colMode === 3 ? 'High Scatter Fog' : 'Controlled Scatter'),
          status: spRatio <= 0.20 ? 'optimal' : (spRatio <= 0.45 ? 'acceptable' : 'warning')
        },
        {
          label: 'Weakest IMAGE Stage',
          value: `${weakest[0]}`,
          unit: `${Math.round(weakest[1])}%`,
          meaning: 'Stage needing correction',
          status: weakest[1] >= 80 ? 'optimal' : 'warning'
        },
        {
          label: 'Recording Readiness',
          value: `${Math.round(composite)}`,
          unit: '/100',
          meaning: disposition,
          status: composite >= 85 ? 'optimal' : (composite >= 65 ? 'acceptable' : 'critical')
        }
      ],
      score: clamp(Math.round(composite), 0, 100),
      observation: criticalWarning || `Virtual AP Knee setup readiness is ${Math.round(composite)}/100 (${disposition}). EI is ${ei} (${diNum >= 0 ? '+' : ''}${di} DI, σ=${noiseSD}%). Total unsharpness Ut=${ut} mm. Weakest area: ${weakest[0]} (${Math.round(weakest[1])}%).`
    };
  }

  function computeImageEval(v) {
    const anatomy = v.anatomy !== undefined ? Number(v.anatomy) : 85;
    const rotation = v.rotation !== undefined ? Number(v.rotation) : (v.position !== undefined ? Math.round((100 - v.position) * 0.4) : 0);
    const mas = v.mas !== undefined ? Number(v.mas) : (v.exposure !== undefined ? Math.max(1, Math.round(v.exposure * 0.16)) : 8);
    const marker = v.marker !== undefined ? Number(v.marker) : (v.markers !== undefined ? (v.markers < 50 ? 3 : v.markers < 80 ? 2 : 0) : 0);
    const artifact = v.artifact !== undefined ? Number(v.artifact) : 0;
    const ww = v.ww !== undefined ? Number(v.ww) : 400;
    const wl = v.wl !== undefined ? Number(v.wl) : 200;

    // 1. Anatomy Score (Distal femur to proximal tib/fib included, 4-sided collimation)
    const anatScore = clamp(anatomy, 0, 100);
    const isAnatClipped = anatScore < 70;

    // 2. Positioning Score (AP Knee: 0° is True AP, epicondyles parallel, 1/3 fibular head superimposition)
    const posScore = clamp(100 - Math.abs(rotation) * 3.5, 10, 100);
    const isSevereRotation = Math.abs(rotation) >= 15;

    // 3. Exposure / EI / DI / Noise
    const targetEI = 200;
    const targetMas = 8.0;
    const ei = Math.round(mas * 25);
    const diNum = 10 * Math.log10(mas / targetMas);
    const di = (diNum >= 0 ? '+' : '') + diNum.toFixed(1);
    const noiseSD = Math.max(2.0, (28 / Math.sqrt(mas))).toFixed(1);
    let expScore = 100;
    if (mas < 4) expScore = Math.max(15, 100 - (4 - mas) * 22);
    else if (mas > 16) expScore = Math.max(40, 100 - (mas - 16) * 3.5);
    else expScore = Math.max(70, 100 - Math.abs(diNum) * 10);
    const isSeverePhotonStarvation = mas <= 2.5;

    // 4. Marker Score
    let markScore = 100;
    let markerText = 'Correct lead R marker';
    if (marker === 1) { markScore = 15; markerText = 'Wrong side (L marker on R knee)'; }
    else if (marker === 2) { markScore = 65; markerText = 'Post-exposure digital annotation'; }
    else if (marker === 3) { markScore = 35; markerText = 'Missing side marker'; }

    // 5. Artifact Score
    let artScore = 100;
    let artText = 'Clean (no artifact)';
    if (artifact === 1) { artScore = 25; artText = 'Metal zipper over VOI'; }
    else if (artifact === 2) { artScore = 30; artText = 'Patient motion blur'; }
    else if (artifact === 3) { artScore = 60; artText = 'Detector line defect'; }

    // Weighted composite
    const composite = anatScore * 0.30 + posScore * 0.25 + expScore * 0.25 + markScore * 0.10 + artScore * 0.10;

    // Clinical ALARA Repeat Gating Logic
    let disposition = '';
    let decision = '';
    let correctiveAction = '';
    let isRepeatJustified = false;
    let criticalFail = false;

    if (isAnatClipped) {
      criticalFail = true;
      isRepeatJustified = true;
      decision = 'Non-diagnostic — anatomy clipped';
      disposition = 'REJECT & REPEAT (Justified under ALARA)';
      correctiveAction = 'Expand collimation to 18×24 cm and center CR 1.25 cm distal to patellar apex.';
    } else if (isSevereRotation) {
      criticalFail = true;
      isRepeatJustified = true;
      decision = 'Non-diagnostic — excessive rotation (' + (rotation > 0 ? '+' : '') + rotation + '°)';
      disposition = 'REJECT & REPEAT (Justified under ALARA)';
      correctiveAction = 'Rotate limb ' + (rotation > 0 ? Math.abs(rotation) + '° internally' : Math.abs(rotation) + '° externally') + ' so femoral epicondyles are parallel to IR.';
    } else if (isSeverePhotonStarvation) {
      criticalFail = true;
      isRepeatJustified = true;
      decision = 'Non-diagnostic — severe quantum mottle (EI ' + ei + ', ' + di + ' DI)';
      disposition = 'REJECT & REPEAT (Justified under ALARA)';
      correctiveAction = 'Increase exposure technique from ' + mas + ' mAs to ' + targetMas + ' mAs (target EI 200).';
    } else if (artifact === 1) {
      criticalFail = true;
      isRepeatJustified = true;
      decision = 'Non-diagnostic — metal artifact obscuring VOI';
      disposition = 'REJECT & REPEAT (Justified under ALARA)';
      correctiveAction = 'Remove clothing containing metal fasteners/zippers, provide gown, and re-expose.';
    } else if (artifact === 2) {
      criticalFail = true;
      isRepeatJustified = true;
      decision = 'Non-diagnostic — patient motion unsharpness';
      disposition = 'REJECT & REPEAT (Justified under ALARA)';
      correctiveAction = 'Immobilize knee with sponges/sandbags and give clear "hold still" instructions.';
    } else if (marker === 1) {
      criticalFail = true;
      decision = 'Diagnostic with severe legal risk — wrong side marker';
      disposition = 'CLINICAL / LEGAL REVIEW (Escalate per protocol)';
      correctiveAction = 'Escalate to supervising radiologist and follow institutional laterality verification protocol.';
    } else if (marker === 3) {
      // ALARA PROTECTION GATE: Missing marker on otherwise diagnostic image MUST NOT be repeated!
      decision = 'Diagnostic — missing physical lead marker';
      disposition = 'ACCEPT WITH ADMINISTRATIVE CORRECTION (Do NOT Repeat — ALARA Gate)';
      correctiveAction = 'Apply electronic side marker with dual-technologist verification per department policy; do not re-expose patient.';
    } else if (composite >= 85) {
      decision = 'Optimal diagnostic quality';
      disposition = 'ACCEPT & TRANSMIT TO PACS';
      correctiveAction = 'Image meets all diagnostic criteria; ready for radiologist interpretation.';
    } else {
      decision = 'Provisionally diagnostic / acceptable';
      disposition = 'ACCEPT WITH DOCUMENTED MINOR VARIANCE';
      correctiveAction = 'Diagnostic criteria met without requiring patient re-exposure.';
    }

    const weakestDomain = [
      ['Anatomy & Collimation', anatScore],
      ['Positioning & Alignment', posScore],
      ['Exposure & Noise', expScore],
      ['Marker & Identification', markScore],
      ['Artifacts & Motion', artScore]
    ].sort((a, b) => a[1] - b[1])[0];

    return {
      metrics: [
        { label: 'Critique score', value: String(Math.round(composite)), unit: '/100', meaning: disposition.split('(')[0].trim(), status: composite >= 85 ? 'optimal' : (composite >= 65 ? 'acceptable' : 'critical') },
        { label: 'Exposure index', value: `${ei}`, unit: 'EI', meaning: `${di} DI (σ=${noiseSD}%)`, status: Math.abs(diNum) <= 1.0 ? 'optimal' : (Math.abs(diNum) <= 2.5 ? 'acceptable' : 'warning') },
        { label: 'ALARA verdict', value: isRepeatJustified ? 'Repeat justified' : 'Do not repeat', unit: '', meaning: disposition, status: isRepeatJustified ? 'critical' : 'optimal' },
        { label: 'Weakest domain', value: weakestDomain[0], unit: `${Math.round(weakestDomain[1])}%`, meaning: correctiveAction, status: weakestDomain[1] >= 80 ? 'optimal' : 'warning' }
      ],
      score: clamp(Math.round(composite), 0, 100),
      raw: {
        anatScore, posScore, expScore, markScore, artScore,
        ei, diNum, di, noiseSD, rotation, mas, marker, artifact,
        isRepeatJustified, criticalFail, disposition, decision, correctiveAction
      },
      observation: `IMAGE Evaluation: ${disposition}. Finding: ${decision}. ${correctiveAction}`
    };
  }

  const ARTIFACT_CASES = [
    {
      id: 0,
      name: 'Optimal Clean Baseline',
      modality: 'DR Flat-Panel',
      category: 'Verified Quality',
      stageOrigin: 'E',
      stageName: 'Stage E — Evaluated & Diagnostic',
      stageScores: { I: 100, M: 100, A: 100, G: 100, E: 100 },
      isRepeatJustified: false,
      isQuarantineNeeded: false,
      isRecoverable: true,
      disposition: 'ACCEPT & TRANSMIT TO PACS',
      dispositionType: 'accept',
      decision: 'All 5 IMAGE recording & quality stages optimal',
      correctiveAction: 'No correction needed; image meets all diagnostic criteria.',
      prevention: 'Maintain routine daily QA calibration and standard patient positioning protocols.',
      physicsDesc: 'Homogeneous photon fluence, target EI 200 (DI 0.0), crisp cortical edges, verified lead R marker.',
      patternDesc: 'Normal diagnostic anatomy, open joint space, no extraneous densities.'
    },
    {
      id: 1,
      name: 'DR Column / Dead Pixel Line Defect',
      modality: 'DR Flat-Panel',
      category: 'Hardware / Detector Array',
      stageOrigin: 'E',
      stageName: 'Stage E — Detector Array Defect',
      stageScores: { I: 90, M: 95, A: 95, G: 95, E: 25 },
      isRepeatJustified: false,
      isQuarantineNeeded: true,
      isRecoverable: false,
      disposition: 'QUARANTINE RECEPTOR — INITIATE QC/SERVICE (Do NOT Repeat on Patient)',
      dispositionType: 'quarantine',
      decision: 'Non-responsive TFT detector column line (Hardware Failure)',
      correctiveAction: 'Remove detector from clinical service immediately; initiate flat-field recalibration or TFT panel replacement. Do NOT re-expose patient with the same detector.',
      prevention: 'Perform weekly detector flat-field constancy calibration and dead-pixel mapping.',
      physicsDesc: 'Loss of electronic readout signal along an entire TFT line/column creating a linear dropout.',
      patternDesc: 'Sharp, perfectly straight vertical radiopaque or radiolucent line traversing the entire image matrix.'
    },
    {
      id: 2,
      name: 'Stationary Grid Moiré Pattern Aliasing',
      modality: 'CR / PSP',
      category: 'Aliasing / Geometric-Sampling',
      stageOrigin: 'G',
      stageName: 'Stage G — Grid & Reader Sampling Mismatch',
      stageScores: { I: 85, M: 90, A: 90, G: 35, E: 60 },
      isRepeatJustified: false,
      isRecoverable: true,
      isQuarantineNeeded: false,
      disposition: 'RECOVER VIA POST-PROCESSING / DO NOT REPEAT (ALARA Gate)',
      dispositionType: 'postprocess',
      decision: 'Spatial frequency aliasing between grid frequency and laser scan frequency',
      correctiveAction: 'Apply digital anti-aliasing / low-pass filter in PACS or adjust windowing; use moving Bucky grid or high-frequency stationary grid (≥60 lines/cm) for future exposures.',
      prevention: 'Ensure stationary grid lead strip orientation is perpendicular to CR reader laser scan line, or use high-frequency grid (≥60 l/cm).',
      physicsDesc: 'Grid strip frequency heterodynes with the digital detector/reader pixel sampling frequency near Nyquist limit.',
      patternDesc: 'Wavy, corduroy-like zebra interference fringes across the entire radiograph.'
    },
    {
      id: 3,
      name: 'CR PSP Plate Ghosting / Incomplete Erasure',
      modality: 'CR / PSP',
      category: 'Reader / Optical Erasure',
      stageOrigin: 'I',
      stageName: 'Stage I — Plate Prep & Residual Latent Image',
      stageScores: { I: 30, M: 85, A: 90, G: 90, E: 65 },
      isRepeatJustified: true,
      isRecoverable: false,
      isQuarantineNeeded: false,
      disposition: 'MANDATORY REPEAT JUSTIFIED UNDER ALARA (Obscured Anatomy)',
      dispositionType: 'repeat',
      decision: 'Phantom silhouette from incomplete high-intensity optical erasure of prior exposure',
      correctiveAction: 'Quarantine PSP plate for primary erasure cycle (high-intensity discharge lamp); re-expose patient on a verified clean, freshly erased plate.',
      prevention: 'Implement mandatory secondary erasure for any CR cassette unused for >24 hours or after high-dose procedures.',
      physicsDesc: 'Trapped electrons in BaFBr:Eu2+ F-centers remain unreleased due to insufficient erasure lamp intensity/duration.',
      patternDesc: 'Superimposed phantom anatomical silhouette from previous patient exam faintly visible in background.'
    },
    {
      id: 4,
      name: 'Radiopaque Foreign Body (Zipper/Metal Snap)',
      modality: 'DR / CR / Film',
      category: 'Patient Preparation',
      stageOrigin: 'A',
      stageName: 'Stage A — Inadequate Patient Gowning/Prep',
      stageScores: { I: 95, M: 95, A: 20, G: 90, E: 50 },
      isRepeatJustified: true,
      isRecoverable: false,
      isQuarantineNeeded: false,
      disposition: 'MANDATORY REPEAT JUSTIFIED UNDER ALARA (Critical VOI Obscured)',
      dispositionType: 'repeat',
      decision: 'Dense metallic artifact directly overlying distal femoral cortex & joint space',
      correctiveAction: 'Have patient change into standard hospital gown removing clothing with metal fasteners; repeat projection with identical technique.',
      prevention: 'Strict adherence to pre-exposure patient gowning protocol and visual inspection before positioning.',
      physicsDesc: 'High atomic number (Z) metal creates total photoelectric attenuation, casting an absolute unattenuated shadow.',
      patternDesc: 'High-density radiopaque interlocking zipper teeth and pull tab superimposed directly across diagnostic bone.'
    },
    {
      id: 5,
      name: 'Patient Involuntary Motion Blur',
      modality: 'DR / CR / Film',
      category: 'Patient / Exposure Time',
      stageOrigin: 'A',
      stageName: 'Stage A/M — Motion & Excessive Exposure Time',
      stageScores: { I: 90, M: 45, A: 30, G: 85, E: 40 },
      isRepeatJustified: true,
      isRecoverable: false,
      isQuarantineNeeded: false,
      disposition: 'MANDATORY REPEAT JUSTIFIED UNDER ALARA (Trabeculae Indiscernible)',
      dispositionType: 'repeat',
      decision: 'Severe kinetic unsharpness obscuring trabecular fine microarchitecture',
      correctiveAction: 'Use limb sponges/sandbags for mechanical immobilization; increase mA to reduce exposure time (shorter ms); re-expose.',
      prevention: 'Clear patient pre-exposure instructions ("Hold still, do not move") and use shortest possible exposure time.',
      physicsDesc: 'Spatial displacement of anatomical boundaries during photon emission causes geometric penumbra spread.',
      patternDesc: 'Double contours along cortical edges, fuzzy indistinct joint margins, and smeared trabeculae.'
    },
    {
      id: 6,
      name: 'Focused Grid Cutoff / Off-Level Misalignment',
      modality: 'DR / CR / Film',
      category: 'Beam Guidance & Alignment',
      stageOrigin: 'G',
      stageName: 'Stage G — Central Ray / Grid Misalignment',
      stageScores: { I: 90, M: 70, A: 90, G: 25, E: 45 },
      isRepeatJustified: true,
      isRecoverable: false,
      isQuarantineNeeded: false,
      disposition: 'MANDATORY REPEAT JUSTIFIED UNDER ALARA (Loss of Signal & Severe Noise)',
      dispositionType: 'repeat',
      decision: 'Off-level or off-center CR angulation across lead grid strips causing primary beam absorption',
      correctiveAction: 'Ensure grid is perfectly perpendicular to central ray and centered within convergent focal distance (100 cm); repeat exposure.',
      prevention: 'Verify tube-to-Bucky interlock alignment and ensure grid focal range matches SID for portable and table exams.',
      physicsDesc: 'Primary photons strike lead strips obliquely rather than traversing interspace material, causing severe attenuation.',
      patternDesc: 'Asymmetric progressive lateral density loss with elevated quantum noise towards lateral detector margins.'
    },
    {
      id: 7,
      name: 'Screen-Film Static Discharge (Tree/Crown Spark)',
      modality: 'Screen-Film',
      category: 'Darkroom / Environmental Handling',
      stageOrigin: 'I',
      stageName: 'Stage I — Cassette Unloading & Low Humidity',
      stageScores: { I: 25, M: 90, A: 95, G: 95, E: 55 },
      isRepeatJustified: false,
      isRecoverable: true,
      isQuarantineNeeded: false,
      disposition: 'ACCEPT WITH DOCUMENTED ARTIFACT (Non-Obscuring / ALARA Gate)',
      dispositionType: 'accept',
      decision: 'Electrostatic discharge spark exposing silver halide crystals during cassette handling',
      correctiveAction: 'Document static discharge on QA log; if critical fracture line is not simulated/obscured, accept image to avoid patient dose.',
      prevention: 'Maintain darkroom relative humidity between 40%–60% and use anti-static screen cleaners and slow film handling.',
      physicsDesc: 'Friction between emulsion and intensifying screen generates static electricity; discharge emits visible light sparking emulsion.',
      patternDesc: 'Dendritic branching black tree-like or crown arborization marks originating from film edge.'
    },
    {
      id: 8,
      name: 'Automatic Processor Pi Lines & Scratches',
      modality: 'Screen-Film',
      category: 'Chemical Processor / Mechanical',
      stageOrigin: 'E',
      stageName: 'Stage E — Processor Roller Maintenance',
      stageScores: { I: 90, M: 95, A: 95, G: 95, E: 30 },
      isRepeatJustified: false,
      isRecoverable: true,
      isQuarantineNeeded: false,
      disposition: 'ACCEPT & INITIATE PROCESSOR QA MAINTENANCE (Do NOT Repeat)',
      dispositionType: 'accept',
      decision: 'Mechanical dirt/debris on processor turnaround rollers creating periodic pressure marks',
      correctiveAction: 'Document artifact; clean processor transport racks and crossover rollers; inspect guide shoes for alignment.',
      prevention: 'Perform daily processor roller wipe-downs and scheduled monthly chemical rack servicing.',
      physicsDesc: 'Localized roller pressure deposits or chemical sludge transfers at regular intervals equal to roller circumference (π × d).',
      patternDesc: 'Parallel dark or light lines appearing perpendicular to film travel direction at precise repeating intervals.'
    },
    {
      id: 9,
      name: 'Quantum Mottle / Photon Starvation',
      modality: 'DR / CR',
      category: 'Exposure Technique (mAs)',
      stageOrigin: 'M',
      stageName: 'Stage M — Severe Underexposure (Low mAs)',
      stageScores: { I: 90, M: 20, A: 95, G: 90, E: 40 },
      isRepeatJustified: true,
      isRecoverable: false,
      isQuarantineNeeded: false,
      disposition: 'MANDATORY REPEAT JUSTIFIED UNDER ALARA (Loss of Contrast Resolution)',
      dispositionType: 'repeat',
      decision: 'Severe photon starvation resulting in high statistical noise fluctuation (low SNR)',
      correctiveAction: 'Increase mAs to appropriate diagnostic level (e.g. from 1.5 mAs to 8 mAs for knee) to achieve target EI 200 (DI 0.0); re-expose.',
      prevention: 'Adhere to standardized departmental technique charts and monitor Exposure Index (EI) feedback.',
      physicsDesc: 'Insufficient photon fluence (N) causes Poisson statistical noise (σ = √N) to dominate remnant signal.',
      patternDesc: 'Uniform grainy, sand-like salt-and-pepper noise pattern throughout entire image with loss of low-contrast detail.'
    }
  ];

  function computeArtifacts(v) {
    const rawIdx = Math.round(Number(v.artifact) || 0);
    const idx = clamp(rawIdx, 0, ARTIFACT_CASES.length - 1);
    const art = ARTIFACT_CASES[idx];
    const severity = clamp(Number(v.severity) !== undefined && !isNaN(Number(v.severity)) ? Number(v.severity) : 50, 10, 100);
    const location = Number(v.location) || 0; // 0: Over Critical VOI, 1: Peripheral Margins
    const prevention = clamp(Number(v.prevention) !== undefined && !isNaN(Number(v.prevention)) ? Number(v.prevention) : 75, 0, 100);
    const repeatThreshold = Number(v.repeat) || 60;

    // Diagnostic Impact Calculation
    // Location factor: over critical VOI = 1.0; peripheral = 0.35
    const locationMultiplier = location === 0 ? 1.0 : 0.35;
    const voiImpact = idx === 0 ? 0 : Math.round(severity * locationMultiplier);

    // Repeat necessity determination
    let isRepeatJustified = false;
    let disposition = art.disposition;
    let decision = art.decision;
    let correctiveAction = art.correctiveAction;

    if (idx === 0) {
      isRepeatJustified = false;
      disposition = 'ACCEPT & TRANSMIT TO PACS';
    } else if (art.isQuarantineNeeded) {
      isRepeatJustified = false; // ALARA: Do NOT repeat on patient when equipment is defective!
      disposition = 'QUARANTINE RECEPTOR — INITIATE QC/SERVICE (Do NOT Repeat on Patient)';
      decision = 'Fixed detector line defect across multiple exposures';
    } else if (art.isRecoverable && location === 1) {
      isRepeatJustified = false;
      disposition = 'ACCEPT WITH POST-PROCESSING / DO NOT REPEAT (ALARA Gate)';
      decision = 'Peripheral artifact outside diagnostic VOI';
      correctiveAction = 'Apply windowing/annotation; do NOT re-expose patient as VOI is completely preserved.';
    } else if (voiImpact >= 50 && !art.isRecoverable) {
      isRepeatJustified = true;
      disposition = 'MANDATORY REPEAT JUSTIFIED UNDER ALARA (Obscured Diagnostic Anatomy)';
    } else if (art.isRecoverable) {
      isRepeatJustified = false;
      disposition = 'RECOVER VIA POST-PROCESSING / DO NOT REPEAT (ALARA Gate)';
    } else {
      isRepeatJustified = false;
      disposition = 'ACCEPT WITH DOCUMENTED MINOR VARIANCE (ALARA Gate)';
    }

    const residualRisk = idx === 0 ? 0 : Math.round(severity * (1 - prevention / 100));
    const compositeScore = idx === 0 ? 98 : clamp(Math.round(100 - voiImpact * 0.55 - residualRisk * 0.45), 15, 100);

    return {
      metrics: [
        { label: 'Artifact & Modality', value: art.name, unit: '', meaning: art.modality, status: idx === 0 ? 'optimal' : 'warning' },
        { label: 'IMAGE Root Stage', value: art.stageOrigin + ' (' + art.category + ')', unit: '', meaning: art.stageName, status: idx === 0 ? 'optimal' : 'warning' },
        { label: 'Diagnostic VOI Impact', value: voiImpact + '%', unit: '', meaning: voiImpact >= 50 ? 'Critical anatomy obscured' : 'Diagnostic anatomy preserved', status: voiImpact === 0 ? 'optimal' : (voiImpact < 50 ? 'acceptable' : 'critical') },
        { label: 'ALARA Disposition', value: disposition.split('(')[0].trim(), unit: '', meaning: isRepeatJustified ? 'Repeat indicated' : 'Do not repeat', status: isRepeatJustified ? 'critical' : (idx === 0 ? 'optimal' : 'acceptable') }
      ],
      score: compositeScore,
      raw: {
        idx,
        art,
        severity,
        location,
        prevention,
        voiImpact,
        isRepeatJustified,
        disposition,
        decision,
        correctiveAction,
        residualRisk,
        compositeScore
      },
      observation: `${art.name} (${art.modality}) originated at ${art.stageName}. Disposition: ${disposition}.`
    };
  }

  function computeChain(v) {
    const filament = Number(v.filament != null ? v.filament : 4.2);
    const kvp = Number(v.kvp != null ? v.kvp : 80);
    const targetCode = v.target === 'Mo' || v.target === 0 || v.target === '0' ? 0 : 1;
    const Z = targetCode === 0 ? 42 : 74;
    const targetName = targetCode === 0 ? 'Molybdenum (Z=42)' : 'Tungsten (Z=74)';
    const filtration = Number(v.filtration != null ? v.filtration : 2.5);
    const receptorCode = Number(v.receptor != null ? v.receptor : 2);
    const roleCode = Number(v.role != null ? v.role : 0);

    // 1. Thermionic emission mA from filament heating current (A)
    // Small changes in filament current (3.8-4.8 A) produce large tube current shifts (20-500 mA)
    const tubeMa = Math.round(clamp(18 * Math.pow(10, (filament - 3.8) * 1.45), 15, 600));

    // 2. Bremsstrahlung production efficiency: eta = 10^-9 * Z * V
    // V in Volts = kvp * 1000. Efficiency expressed in percent:
    const efficiencyPct = clamp(1e-9 * Z * (kvp * 1000) * 100, 0.05, 3.5);
    const heatPct = 100 - efficiencyPct;

    // 3. Beam quality (HVL in mm Al eq) and filtration compliance
    // Legal requirement: >= 2.5 mm Al eq for >70 kVp (NCRP 102 / 21 CFR)
    const hvl = (0.025 * kvp + 0.38) * (0.68 + 0.32 * (filtration / 2.5));
    const isFiltrationCompliant = kvp < 70 ? filtration >= 1.5 : filtration >= 2.5;

    // 4. Receptor conversion and signal index
    // Relative primary photon fluence at collimator exit:
    const primaryFluence = tubeMa * Math.pow(kvp / 80, 2.1) * Math.exp(-0.15 * (filtration - 2.5));
    // Attenuation through 20cm soft-tissue phantom:
    const penetration = 0.024 * (1 / (1 + Math.exp(-(kvp - 72) / 12)));
    const remnantFluence = primaryFluence * penetration;

    // Modality conversion factors
    const receptorNames = [
      'Screen-Film (400 Speed)',
      'CR (BaFBr:Eu²⁺ PSP)',
      'DR (CsI / a-Si Flat Panel)',
      'Fluoroscopy (Image Intensifier)'
    ];
    const receptorSensitivities = [1.0, 1.25, 1.85, 2.6];
    const receptorName = receptorNames[receptorCode] || receptorNames[2];
    const sensFactor = receptorSensitivities[receptorCode] || 1.85;

    // Receptor signal (normalized diagnostic window: 8 to 24 a.u.)
    const receptorSignal = clamp(remnantFluence * sensFactor * 5.2, 1.0, 60.0);

    // Diagnostic quality score (10-100)
    let score = 100;
    if (!isFiltrationCompliant) score -= 25; // Radiation safety violation: beam underfiltered
    if (receptorSignal < 8) {
      score -= Math.min(45, Math.round((8 - receptorSignal) * 6)); // Severe underexposure / mottle
    } else if (receptorSignal > 24) {
      score -= Math.min(40, Math.round((receptorSignal - 24) * 2.5)); // Overexposure / dose creep / saturation
    }
    if (targetCode === 0 && kvp > 65) {
      score -= 15; // Molybdenum target inappropriate for high kVp general radiography
    }
    score = clamp(Math.round(score), 10, 100);

    const roleName = roleCode === 1 ? 'Image Analysis (Quality & Critique)' : 'Image Recording (Technique & Setup)';

    return {
      metrics: [
        {
          label: 'Thermionic Current',
          value: String(tubeMa),
          unit: 'mA',
          meaning: `Filament @ ${round(filament, 1)} A -> ${tubeMa} mA electron stream`,
          status: tubeMa >= 80 && tubeMa <= 400 ? 'optimal' : tubeMa >= 40 ? 'acceptable' : 'warning'
        },
        {
          label: 'Target Conversion Yield',
          value: `${round(efficiencyPct, 2)}% X-ray`,
          unit: `(${round(heatPct, 1)}% Heat)`,
          meaning: `${targetName}: ~99% kinetic energy converted to heat, ~1% X-rays`,
          status: 'optimal'
        },
        {
          label: 'Beam Quality (HVL)',
          value: round(hvl, 2),
          unit: 'mm Al',
          meaning: isFiltrationCompliant
            ? `Filtration ${round(filtration, 1)} mm Al eq meets legal safety standard`
            : `WARNING: ${round(filtration, 1)} mm Al fails legal standard (>=2.5 mm required above 70 kVp)`,
          status: isFiltrationCompliant ? 'optimal' : 'critical'
        },
        {
          label: 'Receptor Signal Index',
          value: round(receptorSignal, 1),
          unit: 'a.u.',
          meaning: receptorSignal >= 8 && receptorSignal <= 24
            ? `${receptorName}: Diagnostic exposure window`
            : receptorSignal < 8
              ? `${receptorName}: Underexposed (excessive quantum mottle)`
              : `${receptorName}: Overexposed (detector saturation / dose creep)`,
          status: receptorSignal >= 8 && receptorSignal <= 24 ? 'optimal' : 'warning'
        }
      ],
      score,
      observation: `Cathode filament heating (${round(filament, 1)} A) generates a ${tubeMa} mA thermionic electron stream accelerated across ${kvp} kVp. At the ${targetName} anode focal spot, exactly ${round(efficiencyPct, 2)}% of electron kinetic energy converts to bremsstrahlung X-rays while ${round(heatPct, 1)}% dissipates as intense thermal heat. Beam filtration (${round(filtration, 1)} mm Al eq) yields a diagnostic beam quality of ${round(hvl, 2)} mm Al HVL (${isFiltrationCompliant ? 'compliant with radiation protection standards' : 'NON-COMPLIANT: insufficient filtration elevates patient entrance skin dose'}). Remnant radiation strikes the ${receptorName}, producing a relative receptor response of ${round(receptorSignal, 1)} a.u. Active RT Focus: ${roleName}.`
    };
  }

  const calculators = {
    chain: computeChain,
    formation: computeFormation,
    film: computeFilm,
    density: computeDensity,
    contrast: computeContrast,
    sharpness: computeSharpness,
    distortion: computeDistortion,
    scatter: computeScatter,
    noise: computeNoise,
    fluoro: computeFluoro,
    digital: computeDigital,
    window: computeWindow,
    'image-record': computeImageRecord,
    'image-eval': computeImageEval,
    artifacts: computeArtifacts
  };

  function drawBase(ctx, title) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#061524');
    gradient.addColorStop(1, '#0e2b3f');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    if (title) {
      ctx.fillStyle = '#b8eff0';
      ctx.font = '700 13.5px Segoe UI, Arial, sans-serif';
      ctx.fillText(title, 20, 26);
    }
  }

  function drawChain(ctx, v, result, title) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const filament = Number(v.filament != null ? v.filament : 4.2);
    const kvp = Number(v.kvp != null ? v.kvp : 80);
    const targetCode = v.target === 'Mo' || v.target === 0 || v.target === '0' ? 0 : 1;
    const filtration = Number(v.filtration != null ? v.filtration : 2.5);
    const receptorCode = Number(v.receptor != null ? v.receptor : 2);
    const roleCode = Number(v.role != null ? v.role : 0);

    const tubeMa = Number(result.metrics[0].value) || 100;
    const efficiencyStr = result.metrics[1].value;
    const hvlVal = result.metrics[2].value;
    const receptorSignal = Number(result.metrics[3].value) || 14;

    const receptorNames = ['Screen-Film', 'CR (PSP)', 'DR Flat Panel', 'Fluoro (II)'];
    const currentReceptor = receptorNames[receptorCode] || 'DR Flat Panel';

    // -------------------------------------------------------------
    // 1. LEFT PANE: CUTAWAY X-RAY TUBE & BEAM PATH
    // -------------------------------------------------------------
    const tubeX = 24, tubeY = 46, tubeW = 510, tubeH = 160;

    // Tube outer protective housing
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, tubeX, tubeY, tubeW, tubeH, 12);
    ctx.fill();
    ctx.stroke();

    // Insulating oil field pattern
    ctx.fillStyle = 'rgba(234, 179, 8, 0.05)';
    ctx.fillRect(tubeX + 6, tubeY + 6, tubeW - 12, tubeH - 12);

    // Evacuated glass envelope
    const envX = tubeX + 24, envY = tubeY + 16, envW = tubeW - 48, envH = tubeH - 32;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, envX, envY, envW, envH, 8);
    ctx.fill();
    ctx.stroke();

    // Housing header
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
    ctx.fillText('EVACUATED TUBE ENVELOPE (VACUUM)', envX + 12, envY + 18);

    // --- Cathode Assembly (Left) ---
    const cathX = envX + 36, cathY = envY + envH / 2;
    // Focusing cup
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cathX, cathY - 28);
    ctx.lineTo(cathX + 18, cathY - 24);
    ctx.lineTo(cathX + 18, cathY + 24);
    ctx.lineTo(cathX, cathY + 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Filament coil
    const filamentGlow = clamp((filament - 3.8) / 1.0, 0.2, 1.0);
    const coilX = cathX + 10;
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 + 0.6 * filamentGlow})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(coilX, cathY - 14);
    for (let i = 0; i < 6; i++) {
      const cy = cathY - 14 + (i + 0.5) * (28 / 6);
      const cx = coilX + (i % 2 === 0 ? 5 : -1);
      ctx.lineTo(cx, cy);
    }
    ctx.lineTo(coilX, cathY + 14);
    ctx.stroke();

    // Thermionic halo glow
    const haloGrad = ctx.createRadialGradient(coilX + 4, cathY, 2, coilX + 4, cathY, 26 * filamentGlow);
    haloGrad.addColorStop(0, `rgba(254, 240, 138, ${0.8 * filamentGlow})`);
    haloGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.35 * filamentGlow})`);
    haloGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(coilX + 4, cathY, 26 * filamentGlow, 0, Math.PI * 2);
    ctx.fill();

    // Cathode label
    ctx.fillStyle = '#fef08a';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.fillText('CATHODE (–)', cathX - 22, cathY - 34);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 10px monospace';
    ctx.fillText(`${filament.toFixed(1)} A (${tubeMa} mA)`, cathX - 22, cathY + 42);

    // --- Anode Assembly (Right) ---
    const anodeCenter = envX + envW - 90;
    const focalX = anodeCenter - 14;
    const focalY = cathY;

    // Rotor and stator stem
    ctx.fillStyle = '#334155';
    ctx.fillRect(anodeCenter + 22, cathY - 10, 48, 20);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(anodeCenter + 22, cathY - 10, 48, 20);

    // Rotating Anode beveled disc
    ctx.save();
    ctx.translate(anodeCenter, cathY);
    ctx.fillStyle = targetCode === 0 ? '#475569' : '#94a3b8';
    ctx.strokeStyle = targetCode === 0 ? '#94a3b8' : '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Beveled target face
    ctx.moveTo(-16, -45);
    ctx.lineTo(16, -45);
    ctx.lineTo(24, 45);
    ctx.lineTo(-8, 45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Anode Heat dissipation glow (~99% heat!)
    const heatGlow = ctx.createRadialGradient(4, 0, 4, 4, 0, 50);
    heatGlow.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
    heatGlow.addColorStop(0.4, 'rgba(249, 115, 22, 0.45)');
    heatGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = heatGlow;
    ctx.beginPath();
    ctx.arc(4, 0, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Focal spot burst
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(focalX, focalY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Anode label & heat notice
    ctx.fillStyle = '#f87171';
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.fillText('ANODE (+) FOCAL SPOT', anodeCenter - 45, cathY - 50);
    ctx.fillStyle = '#fca5a5';
    ctx.font = '700 10px -apple-system, sans-serif';
    ctx.fillText(`${targetCode === 0 ? 'Molybdenum Z=42' : 'Tungsten Z=74'}`, anodeCenter - 36, cathY + 54);
    ctx.fillStyle = '#fca5a5';
    ctx.font = '800 9.5px monospace';
    ctx.fillText('🔥 ~99% Heat / ⚡ ~1% X-ray', anodeCenter - 54, cathY + 67);

    // --- Accelerated Electron Stream (Cathode to Anode) ---
    const streamStart = coilX + 16;
    const streamEnd = focalX - 4;
    const eLines = 5;
    for (let i = 0; i < eLines; i++) {
      const ey = cathY - 8 + i * 4;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(streamStart, ey);
      ctx.lineTo(streamEnd, focalY - 4 + i * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Stream Label
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 10.5px monospace';
    ctx.fillText(`e– Kinetic Stream: ${kvp} kVp potential`, streamStart + 22, cathY - 14);

    // --- Tube Window & Added Filtration ---
    const winX = focalX - 18, winY = tubeY + tubeH, winW = 36, winH = 14;
    // Window opening
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(winX, winY - 4, winW, winH);
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(winX, winY - 4, winW, winH);

    // Filtration plate
    const isCompliant = kvp < 70 ? filtration >= 1.5 : filtration >= 2.5;
    const filtY = winY + 12;
    ctx.fillStyle = isCompliant ? '#0284c7' : '#d97706';
    ctx.fillRect(winX - 6, filtY, winW + 12, 8);
    ctx.strokeStyle = isCompliant ? '#38bdf8' : '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX - 6, filtY, winW + 12, 8);

    // Filtration label
    ctx.fillStyle = isCompliant ? '#7dd3fc' : '#fde047';
    ctx.font = '700 9.5px -apple-system, sans-serif';
    ctx.fillText(`Filter: ${filtration.toFixed(1)} mm Al eq ${isCompliant ? '✔' : '⚠️ Non-compliant'}`, winX + winW + 12, filtY + 7);

    // --- Collimator Housing & Lead Shutters ---
    const colY = filtY + 12;
    const colW = 60, colH = 22;
    const colX = focalX - colW / 2;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(colX, colY, colW, colH);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(colX, colY, colW, colH);
    // Lead shutter blades
    ctx.fillStyle = '#64748b';
    ctx.fillRect(colX + 4, colY + 6, 16, 10);
    ctx.fillRect(colX + colW - 20, colY + 6, 16, 10);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 9.5px -apple-system, sans-serif';
    ctx.fillText('Collimator Lead Shutters', colX + colW + 8, colY + 14);

    // --- Useful Divergent X-Ray Beam Cone ---
    const beamTopY = colY + colH;
    const beamBotY = h - 54;
    const beamSpread = 85;
    const bLeft = focalX - beamSpread;
    const bRight = focalX + beamSpread;

    const beamGrad = ctx.createLinearGradient(focalX, beamTopY, focalX, beamBotY);
    beamGrad.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
    beamGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.18)');
    beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.08)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(focalX - 10, beamTopY);
    ctx.lineTo(bRight, beamBotY);
    ctx.lineTo(bLeft, beamBotY);
    ctx.lineTo(focalX + 10, beamTopY);
    ctx.closePath();
    ctx.fill();

    // Central Ray (CR) dashed axis
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(focalX, focalY + 4);
    ctx.lineTo(focalX, beamBotY);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Patient Tissue Phantom ---
    const phantY = beamTopY + 36;
    const phantW = 120, phantH = 34;
    const phantX = focalX - phantW / 2;

    // Soft tissue layer
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1;
    drawRoundRect(ctx, phantX, phantY, phantW, phantH, 6);
    ctx.fill();
    ctx.stroke();

    // Bone core
    ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
    ctx.strokeStyle = '#cbd5e1';
    drawRoundRect(ctx, focalX - 18, phantY + 6, 36, phantH - 12, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 9.5px -apple-system, sans-serif';
    ctx.fillText('Patient Phantom (Tissue + Bone)', phantX + phantW + 8, phantY + 20);

    // --- Remnant Beam Lines ---
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    for (let bx = bLeft + 12; bx < bRight; bx += 22) {
      if (Math.abs(bx - focalX) < 14) continue; // Attenuated by bone
      ctx.beginPath();
      ctx.moveTo(bx, phantY + phantH);
      ctx.lineTo(bx + (bx - focalX) * 0.15, beamBotY);
      ctx.stroke();
    }

    // --- Image Receptor Platform (Bottom) ---
    const irW = 200, irH = 18;
    const irX = focalX - irW / 2;
    const irY = beamBotY;

    // Modality-specific styling
    const irColors = ['#059669', '#0284c7', '#4f46e5', '#db2777'];
    const irBorder = ['#34d399', '#38bdf8', '#818cf8', '#f472b6'];
    ctx.fillStyle = irColors[receptorCode] || irColors[2];
    ctx.strokeStyle = irBorder[receptorCode] || irBorder[2];
    ctx.lineWidth = 2;
    drawRoundRect(ctx, irX, irY, irW, irH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 10.5px -apple-system, sans-serif';
    ctx.fillText(`RECEPTOR: ${currentReceptor.toUpperCase()} [${round(receptorSignal, 1)} a.u.]`, irX + 10, irY + 13);

    // -------------------------------------------------------------
    // 2. RIGHT PANE: REAL-TIME PREVIEW & RADIOGRAPHER HUD
    // -------------------------------------------------------------
    const pX = w - 240, pY = 46, pW = 220;

    // Role Indicator Card (Top Right)
    const isRecording = roleCode === 0;
    ctx.fillStyle = isRecording ? '#064e3b' : '#1e1b4b';
    ctx.strokeStyle = isRecording ? '#10b981' : '#6366f1';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, pX, pY, pW, 58, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isRecording ? '#6ee7b7' : '#c7d2fe';
    ctx.font = '900 11px -apple-system, sans-serif';
    ctx.fillText(isRecording ? '📸 RADIOGRAPHER ROLE: RECORDING' : '🔍 RADIOGRAPHER ROLE: ANALYSIS', pX + 10, pY + 18);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 10px -apple-system, sans-serif';
    if (isRecording) {
      ctx.fillText(`Active Factors: ${tubeMa} mA | ${kvp} kVp | ${filtration} mm Al`, pX + 10, pY + 34);
      ctx.fillText('Action: Adjusting parameters & patient geometry', pX + 10, pY + 48);
    } else {
      ctx.fillText(`Critique: Signal ${round(receptorSignal, 1)} | Score ${result.score}/100`, pX + 10, pY + 34);
      ctx.fillText('Action: Evaluating diagnostic contrast & SNR', pX + 10, pY + 48);
    }

    // Simulated Radiograph Display Monitor (Middle Right)
    const monY = pY + 68;
    const monH = 150;
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, pX, monY, pW, monH, 8);
    ctx.fill();
    ctx.stroke();

    // Monitor Power LED
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(pX + pW - 12, monY + 12, 3, 0, Math.PI * 2);
    ctx.fill();

    // Radiograph viewport inside monitor
    const scrX = pX + 8, scrY = monY + 22, scrW = pW - 16, scrH = monH - 30;
    ctx.save();
    ctx.beginPath();
    ctx.rect(scrX, scrY, scrW, scrH);
    ctx.clip();

    // Base background exposure darkness (higher signal = darker unattenuated field)
    const baseDarkness = clamp(0.1 + (receptorSignal / 24) * 0.75, 0.1, 0.95);
    ctx.fillStyle = `rgba(0, 0, 0, ${baseDarkness})`;
    ctx.fillRect(scrX, scrY, scrW, scrH);

    // Anatomical soft tissue profile
    const tisAlpha = clamp(0.18 + (receptorSignal / 30) * 0.4, 0.1, 0.65);
    ctx.fillStyle = `rgba(148, 163, 184, ${tisAlpha})`;
    ctx.beginPath();
    ctx.ellipse(scrX + scrW / 2, scrY + scrH / 2, scrW * 0.38, scrH * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cortical bone structure (lighter, higher attenuation)
    const boneAlpha = clamp(0.85 - (receptorSignal / 32) * 0.35, 0.25, 0.95);
    ctx.fillStyle = `rgba(241, 245, 249, ${boneAlpha})`;
    ctx.beginPath();
    drawRoundRect(ctx, scrX + scrW / 2 - 12, scrY + 14, 24, scrH - 28, 4);
    ctx.fill();

    // Simulated Quantum Mottle Noise if underexposed
    if (receptorSignal < 8) {
      const noiseGen = mulberry32(Math.round(filament * 100 + kvp));
      const mottleCount = Math.round((8 - receptorSignal) * 120);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let n = 0; n < mottleCount; n++) {
        const nx = scrX + noiseGen() * scrW;
        const ny = scrY + noiseGen() * scrH;
        ctx.fillRect(nx, ny, 1.5, 1.5);
      }
    }

    // Image Status Watermark Banner
    ctx.fillStyle = receptorSignal >= 8 && receptorSignal <= 24
      ? 'rgba(16, 185, 129, 0.85)'
      : (receptorSignal < 8 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(245, 158, 11, 0.85)');
    ctx.fillRect(scrX, scrY + scrH - 18, scrW, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 9.5px -apple-system, sans-serif';
    const statusTxt = receptorSignal >= 8 && receptorSignal <= 24
      ? 'DIAGNOSTIC RADIOGRAPH'
      : (receptorSignal < 8 ? 'UNDEREXPOSED (QUANTUM MOTTLE)' : 'OVEREXPOSED (DOSE CREEP)');
    ctx.fillText(statusTxt, scrX + 6, scrY + scrH - 5);
    ctx.restore();

    // Physics Metrics Summary Card (Bottom Right)
    const cardY = monY + monH + 8;
    const cardH = h - cardY - 14;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    drawRoundRect(ctx, pX, cardY, pW, cardH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 10px -apple-system, sans-serif';
    ctx.fillText('PHYSICAL CONVERSION READOUT', pX + 8, cardY + 14);

    ctx.font = '600 9.5px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`• e– Tube Current: ${tubeMa} mA`, pX + 8, cardY + 28);
    ctx.fillText(`• Target Heat: 🔥 ${round(100 - parseFloat(efficiencyStr), 1)}%`, pX + 8, cardY + 41);
    ctx.fillText(`• X-ray Yield: ⚡ ${efficiencyStr}`, pX + 8, cardY + 54);
    ctx.fillText(`• Beam HVL: ${hvlVal} mm Al`, pX + 8, cardY + 67);
    ctx.fillText(`• Receptor Signal: ${round(receptorSignal, 1)} a.u.`, pX + 8, cardY + 80);

    // Score meter badge
    ctx.fillStyle = result.score >= 80 ? '#10b981' : result.score >= 60 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(w - 180, h - 24, 150 * (result.score / 100), 8);
    ctx.strokeStyle = '#d8e8ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(w - 180, h - 24, 150, 8);
  }

  function draw(type, ctx, v, result, title) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    drawBase(ctx, title);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.font = '600 12.5px Segoe UI, Arial, sans-serif';

    if (type === 'chain') {
      drawChain(ctx, v, result, title);
    } else if (type === 'formation') {
      const sod = Math.max(1, v.sid - v.oid);
      const magnification = v.sid / sod;
      const penetration = 1 / (1 + Math.exp(-(v.kvp - 68) / 8));
      const sourceX = 62;
      const centerY = h * 0.47;
      const detectorX = sourceX + (v.sid / 180) * (w - sourceX - 52);
      const distanceScale = (detectorX - sourceX) / v.sid;
      const patientX = detectorX - v.oid * distanceScale;
      const beamHalfHeight = 38 + ((v.sid - 80) / 100) * 48;
      const objectHalfHeight = 30;
      const projectedHalfHeight = Math.min(78, objectHalfHeight * magnification);
      const primaryCount = Math.round(6 + ((v.mas - 2) / 38) * 24);
      const transmittedCount = Math.max(1, Math.round(primaryCount * (0.16 + penetration * 0.78)));
      const signal = Number(result.metrics[3].value);
      const detectorResponse = clamp(1 - Math.exp(-signal / 16), 0.08, 1);

      // Beam envelope with intensity gradient
      const beamGrad = ctx.createLinearGradient(sourceX, centerY, detectorX, centerY);
      beamGrad.addColorStop(0, 'rgba(244,199,106,0.22)');
      beamGrad.addColorStop(1, 'rgba(244,199,106,0.04)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(sourceX + 16, centerY);
      ctx.lineTo(detectorX, centerY - beamHalfHeight);
      ctx.lineTo(detectorX, centerY + beamHalfHeight);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(244,199,106,.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sourceX + 16, centerY);
      ctx.lineTo(detectorX, centerY - beamHalfHeight);
      ctx.moveTo(sourceX + 16, centerY);
      ctx.lineTo(detectorX, centerY + beamHalfHeight);
      ctx.stroke();

      // Primary & remnant ray paths
      for (let i = 0; i < primaryCount; i++) {
        const fraction = primaryCount === 1 ? 0.5 : i / (primaryCount - 1);
        const detectorY = centerY - beamHalfHeight + fraction * beamHalfHeight * 2;
        const patientY = centerY + (detectorY - centerY) * ((patientX - sourceX) / (detectorX - sourceX));
        const continues = ((i * 37) % primaryCount) < transmittedCount;
        ctx.strokeStyle = 'rgba(244,199,106,.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sourceX + 16, centerY);
        ctx.lineTo(patientX, patientY);
        ctx.stroke();
        if (continues) {
          ctx.strokeStyle = `rgba(110,213,207,${0.3 + penetration * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(patientX + 7, patientY);
          ctx.lineTo(detectorX, detectorY);
          ctx.stroke();
        }
      }

      // X-ray tube source / focal spot
      ctx.fillStyle = '#173d56';
      ctx.beginPath();
      drawRoundRect(ctx, 20, centerY - 34, 58, 68, 9);
      ctx.fill();
      ctx.strokeStyle = '#75d2cd';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f4c76a';
      ctx.beginPath();
      ctx.arc(sourceX, centerY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dceaf2';
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText('FOCAL', 26, centerY - 7);
      ctx.fillText('SPOT', 31, centerY + 9);

      // Patient/object (anatomical core)
      ctx.fillStyle = 'rgba(188,118,94,.88)';
      ctx.fillRect(patientX - 9, centerY - 66, 18, 132);
      ctx.strokeStyle = '#f3c4b6';
      ctx.lineWidth = 2;
      ctx.strokeRect(patientX - 9, centerY - 66, 18, 132);
      // Dense bone core inside patient
      ctx.fillStyle = '#fdf3e7';
      ctx.beginPath();
      ctx.ellipse(patientX, centerY, 7, objectHalfHeight * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a65b47';
      ctx.stroke();

      // Detector plane and projected object size
      ctx.fillStyle = '#dceaf2';
      ctx.fillRect(detectorX, centerY - 91, 15, 182);
      ctx.strokeStyle = '#75d2cd';
      ctx.lineWidth = 2;
      ctx.strokeRect(detectorX, centerY - 91, 15, 182);
      ctx.fillStyle = `rgba(110,213,207,${0.2 + detectorResponse * 0.72})`;
      ctx.fillRect(detectorX + 3, centerY - projectedHalfHeight, 9, projectedHalfHeight * 2);

      // Magnification calipers on detector
      ctx.strokeStyle = '#f4c76a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(detectorX + 23, centerY - projectedHalfHeight);
      ctx.lineTo(detectorX + 23, centerY + projectedHalfHeight);
      ctx.moveTo(detectorX + 18, centerY - projectedHalfHeight);
      ctx.lineTo(detectorX + 28, centerY - projectedHalfHeight);
      ctx.moveTo(detectorX + 18, centerY + projectedHalfHeight);
      ctx.lineTo(detectorX + 28, centerY + projectedHalfHeight);
      ctx.stroke();

      // Component labels
      ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillStyle = '#f4c76a';
      ctx.fillText('PRIMARY BEAM', Math.max(95, patientX * 0.42), 48);
      ctx.fillStyle = '#6ed5cf';
      ctx.fillText('REMNANT BEAM', patientX + Math.max(16, (detectorX - patientX) * 0.16), 48);
      ctx.fillStyle = '#dceaf2';
      ctx.fillText('PATIENT PHANTOM', Math.max(85, patientX - 100), centerY + 94);
      ctx.fillText('IMAGE RECEPTOR', Math.min(w - 85, detectorX + 28), centerY + 86);
      ctx.fillStyle = '#f4c76a';
      ctx.fillText(`${magnification.toFixed(3)}× image`, Math.min(w - 95, detectorX + 30), centerY + 4);

      // Brackets
      function bracket(x1, x2, y, label, color) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(x1, y); ctx.lineTo(x2, y);
        ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4);
        ctx.moveTo(x2, y - 4); ctx.lineTo(x2, y + 4);
        ctx.stroke();
        ctx.fillStyle = color; ctx.font = '600 11px Segoe UI, Arial';
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, (x1 + x2 - tw) / 2, y - 4);
      }
      bracket(sourceX, patientX, h - 42, `SOD ${round(sod, 1)} cm`, '#b8eff0');
      bracket(patientX, detectorX, h - 25, `OID ${v.oid} cm`, '#f0b8a8');
      bracket(sourceX, detectorX, h - 8, `SID ${v.sid} cm`, '#f4c76a');

      // Console badge
      ctx.fillStyle = 'rgba(7,26,43,.85)';
      ctx.fillRect(w - 225, 10, 210, 48);
      ctx.strokeStyle = '#28546a';
      ctx.strokeRect(w - 225, 10, 210, 48);
      ctx.font = '600 11px Segoe UI, Arial';
      ctx.fillStyle = '#f4c76a';
      ctx.fillText(`Photon quantity: ${primaryCount} ray tracks`, w - 215, 28);
      ctx.fillStyle = '#6ed5cf';
      ctx.fillText(`Penetration index: ${Math.round(penetration * 100)}%`, w - 215, 46);

    } else if (type === 'film') {
      const quality = Number(result.metrics[3].value);
      const stages = [
        { label: 'Developer (35°C)', color: '#f4c76a', desc: 'Reduces Ag⁺ to Ag' },
        { label: 'Stop / Rinse', color: '#6ed5cf', desc: 'Halts alkalinity' },
        { label: 'Fixer Tank', color: '#4fd1c5', desc: 'Clears unexposed AgX' },
        { label: 'Wash Tank', color: '#7dd3fc', desc: 'Removes thiosulfate' },
        { label: 'Dryer (Warm Air)', color: '#fca5a5', desc: 'Hardens gelatin' }
      ];

      // Automatic processor tanks cutaway
      const startX = 40;
      const tankW = (w - 80) / stages.length;
      stages.forEach((st, i) => {
        const x = startX + i * tankW;
        ctx.fillStyle = '#13283b';
        ctx.fillRect(x + 4, 70, tankW - 8, 120);
        ctx.strokeStyle = st.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, 70, tankW - 8, 120);

        // Fluid / air level
        ctx.fillStyle = st.color;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x + 6, 110, tankW - 12, 78);
        ctx.globalAlpha = 1;

        // Rollers
        ctx.fillStyle = '#dceaf2';
        ctx.beginPath(); ctx.arc(x + tankW / 2, 95, 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + tankW / 2, 145, 12, 0, Math.PI * 2); ctx.fill();

        ctx.font = '700 11px Segoe UI, Arial';
        ctx.fillStyle = '#fff';
        ctx.fillText(st.label, x + 8, 88);
        ctx.font = '500 9.5px Segoe UI, Arial';
        ctx.fillStyle = '#b8eff0';
        ctx.fillText(st.desc, x + 8, 180);
      });

      // Safelight indicator
      ctx.fillStyle = v.safelight >= 90 ? '#10b981' : v.safelight >= 60 ? '#f59e0b' : '#ef4444';
      ctx.beginPath(); ctx.arc(w - 60, 36, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '600 11px Segoe UI, Arial';
      ctx.fillText(`Safelight: ${v.safelight} cm (${v.safelight >= 90 ? 'Safe' : 'Fog Risk'})`, w - 210, 40);

      // Film quality index bar
      ctx.fillStyle = '#0f293d';
      ctx.fillRect(40, h - 45, w - 80, 24);
      ctx.fillStyle = quality >= 75 ? '#10b981' : quality >= 50 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(40, h - 45, (w - 80) * (quality / 100), 24);
      ctx.strokeStyle = '#224866';
      ctx.strokeRect(40, h - 45, w - 80, 24);
      ctx.fillStyle = '#fff'; ctx.font = '700 12px Segoe UI, Arial';
      ctx.fillText(`Film Processing Diagnostic Index: ${round(quality, 0)} / 100`, 55, h - 29);

    } else if (type === 'density') {
      const marginL = 80, marginB = 55, plotW = w - 160, plotH = h - 110;
      // Axes
      ctx.strokeStyle = '#75d2cd'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(marginL, h - marginB); ctx.lineTo(marginL + plotW, h - marginB);
      ctx.moveTo(marginL, h - marginB); ctx.lineTo(marginL, h - marginB - plotH);
      ctx.stroke();

      ctx.fillStyle = '#b8eff0'; ctx.font = '600 11px Segoe UI, Arial';
      ctx.fillText('Relative Log Exposure (log E)', marginL + plotW * 0.35, h - marginB + 34);
      ctx.fillText('Optical Density (OD)', 14, 60);

      // H&D Characteristic Curve
      ctx.strokeStyle = '#6ed5cf'; ctx.lineWidth = 3.5; ctx.beginPath();
      for (let i = 0; i <= 150; i++) {
        const logE = -2 + i * 4 / 150;
        const speedShift = Math.log10(v.speed / 100);
        const yValue = v.base + 2.9 / (1 + Math.exp(-v.gamma * 2.4 * (logE + speedShift)));
        const px = marginL + (i / 150) * plotW;
        const py = h - marginB - (yValue / 3.4) * plotH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Dynamic tangent slope line
      const speedShift = Math.log10(v.speed / 100);
      const midLogE = -speedShift;
      const midX = marginL + ((midLogE + 2) / 4) * plotW;
      const midY = h - marginB - ((v.base + 1.45) / 3.4) * plotH;
      const tanDx = 35;
      const tanDy = (v.gamma * 28);
      ctx.strokeStyle = 'rgba(244,199,106,0.65)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(midX - tanDx, midY + tanDy);
      ctx.lineTo(midX + tanDx, midY - tanDy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f4c76a'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText(`Gamma (Slope γ = ${v.gamma.toFixed(2)})`, midX + 10, midY - tanDy + 10);

      // Base+Fog line
      const bfogY = h - marginB - (v.base / 3.4) * plotH;
      ctx.strokeStyle = 'rgba(239,68,68,0.5)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(marginL, bfogY); ctx.lineTo(marginL + plotW, bfogY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fca5a5'; ctx.font = '600 10px Segoe UI, Arial';
      ctx.fillText(`Base+Fog (D-min = ${v.base.toFixed(2)})`, marginL + plotW - 140, bfogY - 4);

      // Current operating point & densitometer reticle
      const selLogE = v.exposure;
      const selCurve = 1 / (1 + Math.exp(-v.gamma * 2.4 * (selLogE + speedShift)));
      const selOD = v.base + 2.9 * selCurve;
      const selX = marginL + ((selLogE + 2) / 4) * plotW;
      const selY = h - marginB - (selOD / 3.4) * plotH;

      ctx.strokeStyle = '#f4c76a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(selX, selY, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(selX - 12, selY); ctx.lineTo(selX + 12, selY); ctx.moveTo(selX, selY - 12); ctx.lineTo(selX, selY + 12); ctx.stroke();
      ctx.fillStyle = '#f4c76a';
      ctx.beginPath(); ctx.arc(selX, selY, 4, 0, Math.PI * 2); ctx.fill();

      // Region callouts
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('TOE', marginL + 25, h - marginB - 15);
      ctx.fillText('STRAIGHT-LINE', marginL + plotW * 0.4, h - marginB - plotH * 0.5);
      ctx.fillText('SHOULDER', marginL + plotW - 75, h - marginB - plotH + 15);

      // Probe readout
      ctx.fillStyle = 'rgba(7,26,43,0.9)';
      ctx.fillRect(w - 200, 10, 185, 48);
      ctx.strokeStyle = '#28546a'; ctx.strokeRect(w - 200, 10, 185, 48);
      ctx.font = '700 11.5px Segoe UI, Arial'; ctx.fillStyle = '#f4c76a';
      ctx.fillText(`Densitometer: ${selOD.toFixed(2)} OD`, w - 190, 28);
      ctx.fillStyle = '#6ed5cf'; ctx.font = '600 11px Segoe UI, Arial';
      ctx.fillText(`Transmitted Light: ${(Math.pow(10, -selOD)*100).toFixed(2)}%`, w - 190, 46);

    } else if (type === 'contrast') {
      // Anatomical phantom with 4 distinct tissue compartments + penetrometer step wedge
      const startX = 45;
      const wedgeW = (w - 90) / 10;
      const energy = v.kvp / 80;
      const muSoft = 0.055 / Math.pow(energy, 1.4);
      const muDense = 0.075 / Math.pow(energy, 1.4);
      const softSignal = Math.exp(-muSoft * v.thickness);
      const denseSignal = Math.exp(-muDense * v.thickness);
      const dispContrast = clamp((Math.abs(softSignal - denseSignal) / Math.max(0.001, softSignal)) * v.receptor * (0.65 + v.digital / 100) * 100, 0, 100);

      // 1. Dual-tissue anatomical phantom representation
      ctx.fillStyle = '#10273a';
      ctx.fillRect(startX, 65, w - 90, 85);
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(startX, 65, w - 90, 85);

      // Soft tissue background
      const softGray = clamp(20 + softSignal * 180, 0, 255);
      ctx.fillStyle = `rgb(${softGray},${softGray},${softGray})`;
      ctx.fillRect(startX + 10, 75, (w - 110) * 0.48, 65);

      // Dense bone inclusion
      const boneGray = clamp(20 + denseSignal * 180 * (1 - dispContrast / 150), 0, 255);
      ctx.fillStyle = `rgb(${boneGray},${boneGray},${boneGray})`;
      ctx.beginPath();
      drawRoundRect(ctx, startX + 40, 85, (w - 110) * 0.28, 45, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e293b'; ctx.stroke();

      ctx.fillStyle = '#fff'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText('Tissue Phantom (Soft Tissue + Cortical Bone)', startX + 15, 60);

      // 2. 10-step penetrometer step wedge
      for (let i = 0; i < 10; i++) {
        const stepAttenuation = Math.exp(-(muSoft + i * 0.006) * v.thickness);
        const shade = clamp(15 + stepAttenuation * 230 * (v.receptor * 0.8), 0, 255);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(startX + i * wedgeW, 175, wedgeW, 55);
        ctx.strokeStyle = '#071a2b';
        ctx.strokeRect(startX + i * wedgeW, 175, wedgeW, 55);
        ctx.fillStyle = shade > 128 ? '#000' : '#fff';
        ctx.font = '700 10px Segoe UI, Arial';
        ctx.fillText(`Step ${i + 1}`, startX + i * wedgeW + 6, 205);
      }

      ctx.fillStyle = '#b8eff0'; ctx.font = '600 11.5px Segoe UI, Arial';
      ctx.fillText(`Displayed Contrast: ${dispContrast.toFixed(1)}% (${dispContrast > 45 ? 'Short Scale / High Contrast' : 'Long Scale / Low Contrast'})`, startX, h - 14);

    } else if (type === 'sharpness') {
      const sod = Math.max(1, v.sid - v.oid);
      const magnification = v.sid / sod;
      const unsharpness = (v.focal * v.oid) / sod;

      // Left: Multi-frequency line-pair pattern
      const leftW = (w - 80) * 0.52;
      ctx.fillStyle = '#081c2c';
      ctx.fillRect(35, 65, leftW, 175);
      ctx.strokeStyle = '#224866'; ctx.strokeRect(35, 65, leftW, 175);
      ctx.fillStyle = '#b8eff0'; ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillText('Line-Pair Resolution Test Pattern', 45, 56);

      const freqs = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
      const barBoxW = leftW / freqs.length;
      freqs.forEach((freq, idx) => {
        const x = 40 + idx * barBoxW;
        const lineSpacing = Math.max(2, 18 / freq);
        const isResolved = unsharpness < (1 / (2 * freq));
        ctx.fillStyle = isResolved ? 'rgba(255,255,255,0.95)' : 'rgba(148,163,184,0.35)';
        for (let bx = x + 2; bx < x + barBoxW - 4; bx += lineSpacing * 2) {
          ctx.fillRect(bx, 75, lineSpacing, 130);
        }
        ctx.fillStyle = freq === v.freq ? '#f4c76a' : '#94a3b8';
        ctx.font = '700 9.5px Segoe UI, Arial';
        ctx.fillText(`${freq}`, x + 4, 225);
      });
      ctx.fillText('lp/mm', 40 + leftW - 35, 225);

      // Right: Penumbra geometry & focal spot blur
      const rightX = 45 + leftW + 20;
      const rightW = w - rightX - 35;
      ctx.fillStyle = '#081c2c';
      ctx.fillRect(rightX, 65, rightW, 175);
      ctx.strokeStyle = '#224866'; ctx.strokeRect(rightX, 65, rightW, 175);
      ctx.fillStyle = '#f4c76a'; ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillText(`Penumbra Blur Ug = ${unsharpness.toFixed(3)} mm`, rightX + 10, 56);

      // Focal spot representation
      const fsCenter = rightX + rightW * 0.45;
      ctx.fillStyle = '#f4c76a';
      ctx.fillRect(fsCenter - v.focal * 8, 75, v.focal * 16, 8);
      ctx.fillStyle = '#fff'; ctx.font = '600 10px Segoe UI, Arial';
      ctx.fillText(`F = ${v.focal} mm`, fsCenter - 18, 95);

      // Umbra & Penumbra projections
      const blurPx = clamp(unsharpness * 35, 2, 45);
      const edgeY = 145;
      // Object edge
      ctx.fillStyle = '#f3c4b6'; ctx.fillRect(fsCenter - 25, edgeY, 50, 10);
      ctx.fillText('Object Edge', fsCenter - 25, edgeY - 4);

      // Receptor shadow
      const detY = 205;
      ctx.fillStyle = '#10b981'; // Umbra core
      ctx.fillRect(fsCenter - 20, detY, 40, 12);
      ctx.fillStyle = '#f59e0b'; // Penumbra left & right
      ctx.fillRect(fsCenter - 20 - blurPx, detY, blurPx, 12);
      ctx.fillRect(fsCenter + 20, detY, blurPx, 12);

      ctx.font = '600 10px Segoe UI, Arial';
      ctx.fillStyle = '#f4c76a';
      ctx.fillText(`Penumbra: ${blurPx.toFixed(1)} px`, fsCenter - 30, detY + 26);

    } else if (type === 'distortion') {
      const partAngle = Number(v.part) || 0;
      const offsetCm = Number(v.offset) || 0;
      const oid = Number(v.oid) || 15;
      const sid = Number(v.sid) || 100;
      const viewMode = v.viewMode || '3d-shadow';
      const sod = Math.max(10, sid - oid);
      const mag = sid / sod;

      const l0 = 100; // true object length (mm)
      const lNorm = l0 * mag; // normal baseline length (mm)

      // Synchronize exact shapeFactor from result
      const shape = result && result.metrics && result.metrics[3] ? parseFloat(result.metrics[3].value) : 1.0;
      const lProj = lNorm * shape;
      const deltaL = lProj - lNorm;

      if (viewMode === 'classic') {
        // Preserved Classic 2D Contour Alignment View
        ctx.fillStyle = '#081c2c';
        ctx.fillRect(40, 55, w - 80, 185);
        ctx.strokeStyle = '#224866'; ctx.strokeRect(40, 55, w - 80, 185);

        const centerX = w / 2;
        const centerY = 145;

        // Baseline (amber dashed rectangle)
        ctx.strokeStyle = '#f4c76a'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.strokeRect(centerX - 120, centerY - 40, 240, 80);
        ctx.setLineDash([]);

        // Angled anatomical bone shape (teal solid)
        ctx.save();
        ctx.translate(centerX + offsetCm * 3.5, centerY);
        ctx.rotate(-partAngle * Math.PI / 180);
        ctx.strokeStyle = '#6ed5cf'; ctx.lineWidth = 3.5;
        ctx.fillStyle = 'rgba(110,213,207,0.18)';
        drawRoundRect(ctx, -120 * shape * (mag / 1.15), -40 / shape, 240 * shape * (mag / 1.15), 80 / shape, 8);
        ctx.fill();
        ctx.stroke();

        // Bone condyle features
        ctx.beginPath();
        ctx.arc(-120 * shape * (mag / 1.15) + 15, 0, 12, 0, Math.PI * 2);
        ctx.arc(120 * shape * (mag / 1.15) - 15, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Legend
        ctx.font = '700 11px Segoe UI, Arial';
        ctx.fillStyle = '#f4c76a'; ctx.fillText(`-- Normal Baseline at SID ${sid} cm, OID ${oid} cm: ${lNorm.toFixed(1)} mm`, 55, 75);
        ctx.fillStyle = '#6ed5cf'; ctx.fillText(`- Projected Shadow: ${lProj.toFixed(1)} mm (Delta ${deltaL >= 0 ? '+' : ''}${deltaL.toFixed(1)} mm)`, 55, 93);
        ctx.fillStyle = '#b8eff0'; ctx.font = '600 11.5px Segoe UI, Arial';
        ctx.fillText(`Classic Mode | Offset: ${offsetCm > 0 ? '+' : ''}${offsetCm} cm | Shape Ratio: ${shape.toFixed(3)}x (${shape > 1.015 ? 'Elongation' : shape < 0.985 ? 'Foreshortening' : 'Isometric'})`, 55, h - 8);
      } else {
        // --- ENHANCED 3D PERSPECTIVE SHADOW PROJECTOR STUDIO (FIXED PERPENDICULAR CR) ---
        const stageW = Math.round(w * 0.58);
        const rightX = stageW + 20;
        const rightW = w - rightX - 20;

        // --- 1. LEFT STAGE: TRUE 3D PERSPECTIVE BEAM & ANATOMY STUDIO ---
        ctx.fillStyle = '#061726';
        ctx.fillRect(20, 48, stageW - 10, h - 58);
        ctx.strokeStyle = '#1a415a'; ctx.lineWidth = 1.5;
        ctx.strokeRect(20, 48, stageW - 10, h - 58);

        // 3D Perspective Projection Function (maps 3D space X, Y, Z to 2D stage)
        const originX = 20 + (stageW - 10) / 2;
        const originY = h - 68; // Floor level (Detector grid)

        function to3D(x, y, z) {
          const cosX = 0.96, sinX = 0.10;
          const cosZ = 0.65, sinZ = 0.42;
          return {
            x: originX + x * cosX + z * cosZ,
            y: originY - y + x * sinX - z * sinZ
          };
        }

        // --- A. 3D DETECTOR TABLE (RECEPTOR GRID) ---
        const tableW = 125;
        const tableD = 55;
        const p1 = to3D(-tableW, 0, -tableD);
        const p2 = to3D(tableW, 0, -tableD);
        const p3 = to3D(tableW, 0, tableD);
        const p4 = to3D(-tableW, 0, tableD);

        // Table surface fill (3D perspective grid)
        ctx.fillStyle = '#0a2336';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();

        // 3D Grid lines across table surface
        ctx.strokeStyle = 'rgba(56,189,248,0.25)'; ctx.lineWidth = 1;
        for (let gx = -tableW + 25; gx < tableW; gx += 25) {
          const gStart = to3D(gx, 0, -tableD);
          const gEnd = to3D(gx, 0, tableD);
          ctx.beginPath(); ctx.moveTo(gStart.x, gStart.y); ctx.lineTo(gEnd.x, gEnd.y); ctx.stroke();
        }
        for (let gz = -tableD + 18; gz < tableD; gz += 18) {
          const gStart = to3D(-tableW, 0, gz);
          const gEnd = to3D(tableW, 0, gz);
          ctx.beginPath(); ctx.moveTo(gStart.x, gStart.y); ctx.lineTo(gEnd.x, gEnd.y); ctx.stroke();
        }

        // Table 3D thickness side bevel
        const b1 = to3D(-tableW, -8, -tableD);
        const b2 = to3D(tableW, -8, -tableD);
        const b3 = to3D(tableW, -8, tableD);
        ctx.fillStyle = '#061622';
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(p1.x, p1.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1e4968'; ctx.lineWidth = 1; ctx.stroke();

        // --- B. 3D X-RAY TUBE & FIXED PERPENDICULAR BEAM ---
        // Tube height in 3D (varies smoothly with SID)
        const tubeY3D = Math.round(145 + ((sid - 80) / (180 - 80)) * 55);
        const tubePos = to3D(0, tubeY3D, 0); // Fixed central position (CR is perpendicular 0°)

        // Primary Volumetric X-Ray Beam Cone / Pyramid (translucent golden 3D volume)
        const beamP1 = to3D(-tableW * 0.85, 0, -tableD * 0.85);
        const beamP2 = to3D(tableW * 0.85, 0, -tableD * 0.85);
        const beamP3 = to3D(tableW * 0.85, 0, tableD * 0.85);
        const beamP4 = to3D(-tableW * 0.85, 0, tableD * 0.85);

        const beamGrad = ctx.createLinearGradient(tubePos.x, tubePos.y, originX, originY);
        beamGrad.addColorStop(0, 'rgba(244,199,106,0.22)');
        beamGrad.addColorStop(1, 'rgba(244,199,106,0.03)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(tubePos.x, tubePos.y); ctx.lineTo(beamP1.x, beamP1.y); ctx.lineTo(beamP2.x, beamP2.y); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tubePos.x, tubePos.y); ctx.lineTo(beamP2.x, beamP2.y); ctx.lineTo(beamP3.x, beamP3.y); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tubePos.x, tubePos.y); ctx.lineTo(beamP3.x, beamP3.y); ctx.lineTo(beamP4.x, beamP4.y); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tubePos.x, tubePos.y); ctx.lineTo(beamP4.x, beamP4.y); ctx.lineTo(beamP1.x, beamP1.y); ctx.closePath(); ctx.fill();

        // Fixed Central Ray Line in 3D (dashed cyan perpendicular vector to origin)
        const crCenter3D = to3D(0, 0, 0);
        ctx.strokeStyle = 'rgba(56,189,248,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(tubePos.x, tubePos.y);
        ctx.lineTo(crCenter3D.x, crCenter3D.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Surface normal right-angle symbol on 3D receptor
        const sn1 = to3D(0, 0, 0);
        const sn2 = to3D(8, 0, 0);
        const sn3 = to3D(8, 0, 8);
        const sn4 = to3D(0, 0, 8);
        ctx.strokeStyle = 'rgba(56,189,248,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sn1.x, sn1.y); ctx.lineTo(sn2.x, sn2.y); ctx.lineTo(sn3.x, sn3.y); ctx.lineTo(sn4.x, sn4.y); ctx.closePath();
        ctx.stroke();

        // 3D Metallic X-ray Tube Housing (Fixed perpendicular alignment)
        ctx.save();
        ctx.translate(tubePos.x, tubePos.y);

        // Tube cylinder
        const tubeGrad = ctx.createLinearGradient(-30, -14, 30, 14);
        tubeGrad.addColorStop(0, '#1e4866');
        tubeGrad.addColorStop(0.5, '#457b9d');
        tubeGrad.addColorStop(1, '#0f2b3f');
        ctx.fillStyle = tubeGrad;
        drawRoundRect(ctx, -32, -15, 64, 26, 6);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke();

        // Collimator box
        ctx.fillStyle = '#0a1e2d';
        ctx.fillRect(-18, 11, 36, 10);
        ctx.strokeStyle = '#28546a'; ctx.strokeRect(-18, 11, 36, 10);

        // Focal spot light point
        ctx.fillStyle = '#f4c76a';
        ctx.beginPath(); ctx.arc(0, 3, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#fff'; ctx.font = '700 9.5px Segoe UI, Arial';
        ctx.fillText(`3D Focal Spot (SID ${sid} cm, CR 0° perpendicular)`, tubePos.x - 75, Math.max(16, tubePos.y - 18));

        // --- C. 3D SHADOW ON DETECTOR SURFACE ---
        // 3D Shadow coordinates on receptor plane (Y = 0)
        const baseShadowHalfW = 42 * (mag / 1.15);
        const projShadowHalfW = baseShadowHalfW * shape;
        const shadowShiftX3D = offsetCm * 2.8 * mag;

        // 1. Normal Baseline Footprint (Golden dashed rectangle on 3D table)
        const nb1 = to3D(-baseShadowHalfW, 0, -14);
        const nb2 = to3D(baseShadowHalfW, 0, -14);
        const nb3 = to3D(baseShadowHalfW, 0, 14);
        const nb4 = to3D(-baseShadowHalfW, 0, 14);
        ctx.strokeStyle = 'rgba(244,199,106,0.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(nb1.x, nb1.y); ctx.lineTo(nb2.x, nb2.y); ctx.lineTo(nb3.x, nb3.y); ctx.lineTo(nb4.x, nb4.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Actual Physical Projected 3D Shadow (Contracts/Stretches across 3D table)
        const isShort = shape < 0.985;
        const isElong = shape > 1.015;
        const shadowBorderColor = isShort ? '#ef4444' : isElong ? '#f59e0b' : '#10b981';

        const sh1 = to3D(shadowShiftX3D - projShadowHalfW, 0, -16);
        const sh2 = to3D(shadowShiftX3D + projShadowHalfW, 0, -16);
        const sh3 = to3D(shadowShiftX3D + projShadowHalfW, 0, 16);
        const sh4 = to3D(shadowShiftX3D - projShadowHalfW, 0, 16);

        // Soft Penumbra shadow
        ctx.fillStyle = 'rgba(2,6,23,0.7)';
        ctx.beginPath();
        ctx.moveTo(sh1.x - 3, sh1.y); ctx.lineTo(sh2.x + 3, sh2.y); ctx.lineTo(sh3.x + 3, sh3.y); ctx.lineTo(sh4.x - 3, sh4.y);
        ctx.closePath();
        ctx.fill();

        // Dense Umbra shadow core
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.moveTo(sh1.x, sh1.y); ctx.lineTo(sh2.x, sh2.y); ctx.lineTo(sh3.x, sh3.y); ctx.lineTo(sh4.x, sh4.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shadowBorderColor; ctx.lineWidth = 2;
        ctx.stroke();

        // --- D. 3D VOLUMETRIC ANATOMICAL BONE SUSPENDED IN BEAM ---
        // Dynamic elevation based on OID (5 to 35 cm -> 35 to 95 px)
        const boneElev3D = Math.round(35 + ((oid - 5) / (35 - 5)) * 60);
        const boneX3D = offsetCm * 2.8;
        const boneHalfL3D = 36;
        const partRad = (partAngle * Math.PI) / 180;

        // Exact Physical Ray-Tracing Lines from 3D Focal Spot through bone tips to 3D shadow edges
        ctx.strokeStyle = 'rgba(244,199,106,0.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(tubePos.x, tubePos.y); ctx.lineTo(sh1.x, sh1.y);
        ctx.moveTo(tubePos.x, tubePos.y); ctx.lineTo(sh2.x, sh2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Render 3D Cylindrical Bone Body in perspective
        const boneMid = to3D(boneX3D, boneElev3D, 0);
        ctx.save();
        ctx.translate(boneMid.x, boneMid.y);
        ctx.rotate(partRad + 0.08); // perspective alignment

        // 3D Cylindrical Bone Shaft (Rich volumetric ivory gradient)
        const bGrad = ctx.createLinearGradient(0, -9, 0, 9);
        bGrad.addColorStop(0, '#ffffff');
        bGrad.addColorStop(0.3, '#f1f5f9');
        bGrad.addColorStop(0.7, '#cbd5e1');
        bGrad.addColorStop(1, '#64748b');
        ctx.fillStyle = bGrad;
        drawRoundRect(ctx, -boneHalfL3D, -8, boneHalfL3D * 2, 16, 6);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.stroke();

        // 3D Rounded Epiphyseal Condyles
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(-boneHalfL3D + 4, -4, 5, 0, Math.PI * 2);
        ctx.arc(-boneHalfL3D + 4, 4, 5, 0, Math.PI * 2);
        ctx.arc(boneHalfL3D - 4, -4, 5, 0, Math.PI * 2);
        ctx.arc(boneHalfL3D - 4, 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Calipers on 3D Stage
        ctx.fillStyle = '#fff'; ctx.font = '700 10px Segoe UI, Arial';
        ctx.fillText(`3D Anatomy L₀ = 100 mm (Offset ${offsetCm > 0 ? '+' : ''}${offsetCm} cm, Tilt ${partAngle > 0 ? '+' : ''}${partAngle}°, OID ${oid} cm)`, boneMid.x - 95, boneMid.y - 14);

        ctx.fillStyle = '#f4c76a'; ctx.font = '600 9.5px Segoe UI, Arial';
        ctx.fillText(`[-- Normal Baseline: ${lNorm.toFixed(1)} mm]`, originX - 130, h - 14);
        ctx.fillStyle = shadowBorderColor; ctx.font = '700 9.5px Segoe UI, Arial';
        ctx.fillText(`[- 3D Projected Shadow: ${lProj.toFixed(1)} mm]`, originX + 5, h - 14);

        // --- 2. RIGHT PANEL: DUAL RADIOGRAPH COMPARISON (SYNCHRONIZED) ---
        ctx.fillStyle = '#05111d';
        ctx.fillRect(rightX, 48, rightW, h - 58);
        ctx.strokeStyle = '#1e3a4f'; ctx.lineWidth = 1.5;
        ctx.strokeRect(rightX, 48, rightW, h - 58);

        // Panel Title
        ctx.fillStyle = '#6ed5cf'; ctx.font = '700 11.5px Segoe UI, Arial';
        ctx.fillText('RECEPTOR SHADOW COMPARISON', rightX + 12, 66);

        const cardW = rightW - 24;
        const cardX = rightX + 12;
        const cardCenterX = cardX + cardW / 2;

        // --- TRACK A: NORMAL BASELINE PROJECTION ---
        const normY = 76;
        ctx.fillStyle = 'rgba(15,43,63,0.85)';
        drawRoundRect(ctx, cardX, normY, cardW, 64, 6);
        ctx.fill();
        ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1; ctx.stroke();

        ctx.fillStyle = '#f4c76a'; ctx.font = '700 10px Segoe UI, Arial';
        ctx.fillText('1. NORMAL BASELINE PROJECTION', cardX + 8, normY + 16);
        ctx.fillStyle = '#94a3b8'; ctx.font = '600 9px Segoe UI, Arial';
        ctx.fillText(`Centered (0 cm) | Part 0° | SID ${sid} cm, OID ${oid} cm (M = ${mag.toFixed(2)}x)`, cardX + 8, normY + 28);

        // Baseline bone bar (centered)
        const normBarMaxW = cardW - 30;
        const baseNormW = clamp(normBarMaxW * 0.70 * (mag / 1.2), 35, normBarMaxW);
        const normBarX = cardCenterX - baseNormW / 2;
        const normBarY = normY + 36;

        ctx.fillStyle = 'rgba(244,199,106,0.2)';
        ctx.fillRect(normBarX, normBarY, baseNormW, 14);
        ctx.strokeStyle = '#f4c76a'; ctx.lineWidth = 1.5;
        ctx.strokeRect(normBarX, normBarY, baseNormW, 14);

        ctx.fillStyle = '#fff'; ctx.font = '700 9.5px Segoe UI, Arial';
        ctx.fillText(`${lNorm.toFixed(1)} mm`, cardCenterX - 20, normBarY + 11);

        // --- TRACK B: ACTUAL RECORDED SHADOW (SYNCHRONIZED WITH 3D STAGE) ---
        const projY = 146;
        ctx.fillStyle = 'rgba(7,26,43,0.95)';
        drawRoundRect(ctx, cardX, projY, cardW, 68, 6);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.stroke();

        ctx.fillStyle = '#38bdf8'; ctx.font = '700 10px Segoe UI, Arial';
        ctx.fillText('2. ACTUAL RECORDED SHADOW', cardX + 8, projY + 16);

        // Current projected bone bar (contracts with tilt, stretches with offset)
        const currBarW = clamp(baseNormW * shape, 8, normBarMaxW);
        const currBarX = cardCenterX - currBarW / 2;
        const currBarY = projY + 24;

        ctx.fillStyle = isShort ? 'rgba(239,68,68,0.45)' : isElong ? 'rgba(245,158,11,0.45)' : 'rgba(16,185,129,0.45)';
        ctx.fillRect(currBarX, currBarY, currBarW, 16);
        ctx.strokeStyle = shadowBorderColor; ctx.lineWidth = 2;
        ctx.strokeRect(currBarX, currBarY, currBarW, 16);

        ctx.fillStyle = '#fff'; ctx.font = '700 10px Segoe UI, Arial';
        ctx.fillText(`${lProj.toFixed(1)} mm (${shape.toFixed(3)}x)`, cardCenterX - 28, currBarY + 12);

        // Comparison Delta & Badge
        const badgeY = projY + 46;
        const badgeText = isShort
          ? `FORESHORTENED (Shortening ${deltaL.toFixed(1)} mm)`
          : isElong
            ? `ELONGATED (Elongation +${deltaL.toFixed(1)} mm)`
            : `TRUE ISOMETRIC (Baseline 0.0 mm)`;
        ctx.fillStyle = isShort ? 'rgba(239,68,68,0.2)' : isElong ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)';
        drawRoundRect(ctx, cardX + 8, badgeY, cardW - 16, 17, 4);
        ctx.fill();
        ctx.strokeStyle = shadowBorderColor; ctx.lineWidth = 1; ctx.stroke();

        ctx.fillStyle = shadowBorderColor; ctx.font = '800 9.5px Segoe UI, Arial';
        const btw = ctx.measureText(badgeText).width;
        ctx.fillText(badgeText, cardX + 8 + (cardW - 16 - btw) / 2, badgeY + 12);
      }
    } else if (type === 'scatter') {
      const sprBefore = Number(result.metrics[0].value);
      const residualSpr = Number(result.metrics[1].value);
      const contrastImprovement = Number(result.metrics[2].value);
      const buckyFactor = Number(result.metrics[3].value);

      // Split canvas layout:
      // Left = Physical Radiation & Compton Scatter Chamber (X: 0..620)
      // Right = Simulated Radiograph & Physics Dashboard (X: 635..w-15)
      const chamberW = Math.min(620, w * 0.62);
      const rightX = chamberW + 15;
      const rightW = w - rightX - 15;
      const centerX = chamberW / 2;

      // Subtle Vertical Divider
      ctx.strokeStyle = '#1e384c'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(rightX - 8, 30); ctx.lineTo(rightX - 8, h - 20); ctx.stroke();
      ctx.setLineDash([]);

      // --- 1. X-RAY TUBE & FOCAL SPOT ---
      const tubeY = 32;
      const focalSpotX = centerX;
      const focalSpotY = tubeY + 10;

      // Tube housing
      ctx.fillStyle = '#0f293d';
      drawRoundRect(ctx, centerX - 38, tubeY - 8, 76, 22, 6);
      ctx.fill();
      ctx.strokeStyle = '#224866'; ctx.lineWidth = 1.5; ctx.stroke();

      // Anode target & Focal Spot
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(centerX - 12, tubeY - 2);
      ctx.lineTo(centerX + 8, tubeY - 2);
      ctx.lineTo(centerX, tubeY + 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(focalSpotX, focalSpotY, 4, 0, Math.PI * 2); ctx.fill();

      // Tube Label
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText('X-RAY TUBE (FOCAL SPOT)', 20, 36);
      ctx.fillStyle = '#f4c76a'; ctx.font = '700 12.5px Segoe UI, Arial';
      ctx.fillText(`${v.kVp} kVp Beam Energy`, 20, 52);

      // --- 2. COLLIMATOR HOUSING & ADJUSTABLE LEAD SHUTTERS ---
      const collY = tubeY + 22;
      const collH = 36;
      const collW = 180;
      const collLeft = centerX - collW / 2;

      ctx.fillStyle = 'rgba(15,35,53,0.95)';
      drawRoundRect(ctx, collLeft, collY, collW, collH, 5);
      ctx.fill();
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1.5; ctx.stroke();

      // Collimator aperture based on field size (5 to 40 cm)
      const fieldNorm = (v.field - 5) / 35; // 0..1
      const apertureHalfW = 12 + fieldNorm * 62; // 12px to 74px half-width
      const shutterLeftW = collW / 2 - apertureHalfW;
      const shutterRightW = shutterLeftW;

      // Collimator Lead Blades (Upper & Lower)
      ctx.fillStyle = '#334155'; // Lead gray
      ctx.fillRect(collLeft + 4, collY + 5, shutterLeftW, 11);
      ctx.fillRect(collLeft + 4, collY + 20, shutterLeftW, 11);
      ctx.fillRect(centerX + apertureHalfW, collY + 5, shutterRightW - 4, 11);
      ctx.fillRect(centerX + apertureHalfW, collY + 20, shutterRightW - 4, 11);

      // Shutter edge highlights
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(collLeft + 4 + shutterLeftW - 2.5, collY + 5, 2.5, 26);
      ctx.fillRect(centerX + apertureHalfW, collY + 5, 2.5, 26);

      // Collimator Label
      ctx.fillStyle = '#38bdf8'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText(`COLLIMATOR APERTURE: ${v.field}×${v.field} cm`, collLeft + 15, collY - 4);

      // --- 3. GEOMETRIC PRIMARY BEAM CONE ---
      const patTopY = 120;
      const patH = clamp(v.thickness * 2.8, 30, 105);
      const patBottomY = patTopY + patH;
      const gridY = patBottomY + 16;
      const gridH = 18;
      const irY = gridY + gridH + 6;
      const irH = 16;

      // Beam half-width divergence
      const beamHalfW_top = clamp(apertureHalfW * 2.1, 28, 200);
      const beamHalfW_bottom = beamHalfW_top * (1 + (patH / 170) * 0.78);
      const beamHalfW_grid = beamHalfW_top * (1 + ((patH + 16) / 170) * 0.78);

      // Primary Beam Cone Gradient
      const beamGrad = ctx.createLinearGradient(centerX, focalSpotY, centerX, gridY);
      beamGrad.addColorStop(0, 'rgba(251, 191, 36, 0.32)');
      beamGrad.addColorStop(0.35, 'rgba(251, 191, 36, 0.18)');
      beamGrad.addColorStop(1, 'rgba(251, 191, 36, 0.04)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(focalSpotX, focalSpotY);
      ctx.lineTo(centerX - beamHalfW_grid, gridY);
      ctx.lineTo(centerX + beamHalfW_grid, gridY);
      ctx.closePath();
      ctx.fill();

      // Primary beam boundary rays
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(focalSpotX, focalSpotY);
      ctx.lineTo(centerX - beamHalfW_grid, gridY);
      ctx.moveTo(focalSpotX, focalSpotY);
      ctx.lineTo(centerX + beamHalfW_grid, gridY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Central Ray (CR)
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(centerX, focalSpotY);
      ctx.lineTo(centerX, irY + irH);
      ctx.stroke();
      ctx.setLineDash([]);

      // --- 4. PATIENT PHANTOM (ANATOMICAL SLAB) ---
      const patW = 500;
      const patX = centerX - patW / 2;

      // Patient tissue background
      const patGrad = ctx.createLinearGradient(patX, patTopY, patX + patW, patBottomY);
      patGrad.addColorStop(0, '#102a3e');
      patGrad.addColorStop(0.5, '#163852');
      patGrad.addColorStop(1, '#102a3e');
      ctx.fillStyle = patGrad;
      drawRoundRect(ctx, patX, patTopY, patW, patH, 8);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke();

      // Dense Cortical Bone Core in Patient center
      const boneR = Math.min(15, patH * 0.36);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.beginPath();
      ctx.arc(centerX, patTopY + patH / 2, boneR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; ctx.stroke();

      // Anatomical Labels
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText(`PATIENT TISSUE (${v.thickness} cm thick)`, patX + 10, patTopY + 16);
      if (patH >= 42) {
        ctx.fillStyle = '#64748b'; ctx.font = '600 9.5px Segoe UI, Arial';
        ctx.fillText('Dense Bone Core', centerX - 36, patTopY + patH / 2 + boneR + 11);
      }

      // Highlight Irradiated Volume Zone inside Patient
      ctx.fillStyle = 'rgba(251, 191, 36, 0.14)';
      ctx.beginPath();
      ctx.moveTo(centerX - beamHalfW_top, patTopY);
      ctx.lineTo(centerX + beamHalfW_top, patTopY);
      ctx.lineTo(centerX + beamHalfW_bottom, patBottomY);
      ctx.lineTo(centerX - beamHalfW_bottom, patBottomY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)'; ctx.lineWidth = 1; ctx.stroke();

      // --- 5. STOCHASTIC COMPTON SCATTER ENGINE (MONTE CARLO) ---
      const seed = Math.round(v.field * 7919 + v.thickness * 1013 + v.grid * 313 + v.kVp * 37);
      const rng = mulberry32(seed);

      // Compton scatter count proportional to irradiated volume and kVp
      const scatterCount = Math.round(clamp(sprBefore * 52 + (v.kVp - 50) * 0.2, 12, 120));

      // Grid Acceptance Angle
      const gridRatio = v.grid;
      const acceptanceDeg = gridRatio === 0 ? 89.9 : Math.atan(1 / gridRatio) * (180 / Math.PI);

      let absorbedCount = 0;
      let transmittedScatterCount = 0;
      let lateralScatterCount = 0;

      // Draw primary straight transmission rays (clean non-scattered photons)
      const primaryRays = Math.min(16, Math.max(5, Math.round(v.field / 2.5)));
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.lineWidth = 1;
      for (let p = 0; p < primaryRays; p++) {
        const frac = primaryRays === 1 ? 0.5 : (p / (primaryRays - 1) - 0.5) * 1.8;
        const pxTop = centerX + frac * (beamHalfW_top * 0.75);
        const pxBottom = centerX + frac * (beamHalfW_bottom * 0.75);
        ctx.beginPath();
        ctx.moveTo(pxTop, patTopY);
        ctx.lineTo(pxBottom, patBottomY);
        ctx.stroke();
      }

      // Generate & Trace Stochastic Compton Scatter Photons
      for (let i = 0; i < scatterCount; i++) {
        const depthFrac = 0.08 + rng() * 0.84;
        const y0 = patTopY + depthFrac * patH;

        const localHalfW = beamHalfW_top + (beamHalfW_bottom - beamHalfW_top) * depthFrac;
        const x0 = centerX + (rng() * 2 - 1) * localHalfW * 0.94;

        const cat = rng();
        let thetaDeg;
        if (cat < 0.62) {
          const spread = 52 - (v.kVp - 50) * 0.15;
          thetaDeg = 90 + (rng() * 2 - 1) * spread;
        } else if (cat < 0.84) {
          thetaDeg = rng() < 0.5 ? (rng() * 40 - 20) : (180 + rng() * 40 - 20);
          lateralScatterCount++;
        } else {
          thetaDeg = 270 + (rng() * 2 - 1) * 55;
        }

        const thetaRad = thetaDeg * (Math.PI / 180);
        const dx = Math.cos(thetaRad);
        const dy = Math.sin(thetaRad);

        // Interaction vertex node (Compton collision point)
        ctx.fillStyle = 'rgba(251, 146, 60, 0.95)';
        ctx.beginPath();
        ctx.arc(x0, y0, 2, 0, Math.PI * 2);
        ctx.fill();

        // Ray Tracing & Grid Absorption
        if (dy > 0.15) {
          const distToGrid = (gridY - y0) / dy;
          const xGrid = x0 + dx * distToGrid;
          const rayAngleOffNormal = Math.abs(thetaDeg - 90);

          const isAbsorbedByGrid = gridRatio > 0 && (rayAngleOffNormal > acceptanceDeg || (rng() < 0.15 + gridRatio * 0.04));

          if (isAbsorbedByGrid && xGrid >= patX && xGrid <= patX + patW) {
            absorbedCount++;
            ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(xGrid, gridY + 3);
            ctx.stroke();
            ctx.setLineDash([]);

            // Lead Strip Absorption Impact Marker (Red glow)
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(xGrid, gridY + 3, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            transmittedScatterCount++;
            const distToIR = (irY + 4 - y0) / dy;
            const xIR = x0 + dx * distToIR;

            ctx.strokeStyle = 'rgba(244, 199, 106, 0.85)';
            ctx.lineWidth = 1.1;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(xIR, irY + 4);
            ctx.stroke();
            ctx.setLineDash([]);

            // Scatter impact on detector (creates fog)
            ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
            ctx.beginPath();
            ctx.arc(xIR, irY + 4, 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (Math.abs(dx) > 0.4) {
          const rayLen = 40 + rng() * 65;
          ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + dx * rayLen, y0 + dy * rayLen);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const rayLen = 22 + rng() * 35;
          ctx.strokeStyle = 'rgba(251, 146, 60, 0.35)';
          ctx.lineWidth = 0.9;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + dx * rayLen, y0 + dy * rayLen);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // --- 6. GRID ASSEMBLY (LEAD STRIPS & INTERSPACES) ---
      const gridW = 480;
      const gridLeft = centerX - gridW / 2;

      ctx.fillStyle = '#e2e8f0'; // Aluminum interspace base
      drawRoundRect(ctx, gridLeft, gridY, gridW, gridH, 4);
      ctx.fill();
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.2; ctx.stroke();

      if (gridRatio > 0) {
        const stripSpacing = Math.max(6, 40 / gridRatio);
        ctx.fillStyle = '#0f172a'; // Lead strips
        for (let gx = gridLeft + 4; gx < gridLeft + gridW - 4; gx += stripSpacing) {
          ctx.fillRect(gx, gridY, 2.4, gridH);
        }
        // Grid Active Pill Banner (placed above grid for zero text collision)
        const gridBadgeText = `GRID ${gridRatio}:1 ACTIVE (r = ${gridRatio}) · Lead Strips Absorbing Oblique Scatter`;
        ctx.font = '800 10.5px Segoe UI, Arial';
        const gbw = ctx.measureText(gridBadgeText).width;
        ctx.fillStyle = 'rgba(15,41,61,0.92)';
        drawRoundRect(ctx, centerX - (gbw + 16) / 2, gridY - 15, gbw + 16, 15, 3);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(gridBadgeText, centerX - gbw / 2, gridY - 3.5);
      } else {
        const noGridText = 'NO GRID (Tabletop Mode — Unrestricted Scatter Transmitted to Detector)';
        ctx.font = '700 10.5px Segoe UI, Arial';
        const ngw = ctx.measureText(noGridText).width;
        ctx.fillStyle = 'rgba(15,41,61,0.92)';
        drawRoundRect(ctx, centerX - (ngw + 16) / 2, gridY - 15, ngw + 16, 15, 3);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(noGridText, centerX - ngw / 2, gridY - 3.5);
      }

      // --- 7. IMAGE RECEPTOR (DETECTOR PLANE) ---
      const irW = 480;
      const irLeft = centerX - irW / 2;

      ctx.fillStyle = '#0b1c2d';
      drawRoundRect(ctx, irLeft, irY, irW, irH, 4);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke();

      // Scatter fog indicator on detector
      const fogAlpha = clamp(residualSpr * 0.45, 0.05, 0.85);
      ctx.fillStyle = `rgba(251, 146, 60, ${fogAlpha})`;
      ctx.fillRect(irLeft + 2, irY + 2, irW - 4, irH - 4);

      ctx.fillStyle = '#fff'; ctx.font = '700 10px Segoe UI, Arial';
      ctx.fillText('IMAGE RECEPTOR (DETECTOR PLANE)', irLeft + 8, irY + 12);

      // Bottom Legend / Key
      const legY = h - 12;
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = '#fef08a';
      ctx.fillText('● Primary Ray', 20, legY);
      ctx.fillStyle = '#fb923c';
      ctx.fillText('● Random Compton Scatter', 115, legY);
      ctx.fillStyle = '#ef4444';
      ctx.fillText('● Grid Absorbed', 280, legY);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`Scatter: ${sprBefore.toFixed(2)} SPR → Residual: ${residualSpr.toFixed(2)} SPR`, 385, legY);

      // --- 8. RIGHT PANEL: SIMULATED RADIOGRAPH & QUANTITATIVE IMPACT ---
      // Card 1: Simulated Radiograph Preview (Contrast & Scatter Fog)
      const prevY = 32;
      const prevH = 172;
      ctx.fillStyle = '#081c2c';
      drawRoundRect(ctx, rightX, prevY, rightW, prevH, 8);
      ctx.fill();
      ctx.strokeStyle = '#224866'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#6ed5cf'; ctx.font = '700 12px Segoe UI, Arial';
      ctx.fillText('SIMULATED RADIOGRAPH (CONTRAST)', rightX + 12, prevY + 18);

      // Simulated Image Area (Bone cortex in soft tissue background)
      const simImgX = rightX + 12;
      const simImgY = prevY + 26;
      const simImgW = rightW - 24;
      const simImgH = 78;

      const baseTissueShade = 38;
      const baseBoneShade = 215;
      const fogAdd = clamp(residualSpr * 65, 0, 110);
      const actualTissueShade = Math.round(baseTissueShade + fogAdd);
      const actualBoneShade = Math.round(clamp(baseBoneShade + fogAdd * 0.35, 0, 255));

      // Background Soft Tissue
      ctx.fillStyle = `rgb(${actualTissueShade}, ${actualTissueShade}, ${actualTissueShade})`;
      ctx.fillRect(simImgX, simImgY, simImgW, simImgH);

      // Central Cortical Bone Target (Anatomical Bone Edge)
      ctx.fillStyle = `rgb(${actualBoneShade}, ${actualBoneShade}, ${actualBoneShade})`;
      ctx.fillRect(simImgX + simImgW * 0.32, simImgY + 10, simImgW * 0.36, simImgH - 20);
      // Bone trabecular structure lines
      ctx.strokeStyle = `rgba(255,255,255,${0.4 / (1 + residualSpr)})`; ctx.lineWidth = 1;
      for (let tx = simImgX + simImgW * 0.36; tx < simImgX + simImgW * 0.64; tx += 6) {
        ctx.beginPath(); ctx.moveTo(tx, simImgY + 14); ctx.lineTo(tx, simImgY + simImgH - 14); ctx.stroke();
      }

      ctx.strokeStyle = '#1e3a4f'; ctx.lineWidth = 1;
      ctx.strokeRect(simImgX, simImgY, simImgW, simImgH);

      // Contrast Readout & Assessment
      const measuredContrast = (actualBoneShade - actualTissueShade) / Math.max(1, actualBoneShade + actualTissueShade) * 100;
      const contrastStatus = measuredContrast > 48 ? 'HIGH CONTRAST (Crisp Definition)' : measuredContrast > 28 ? 'MODERATE CONTRAST' : 'LOW CONTRAST (Severe Scatter Fog)';
      const statusColor = measuredContrast > 48 ? '#10b981' : measuredContrast > 28 ? '#f59e0b' : '#ef4444';
      const statusBg = measuredContrast > 48 ? 'rgba(16,185,129,0.15)' : measuredContrast > 28 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';

      ctx.fillStyle = '#fff'; ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillText(`Measured Subject Contrast: ${measuredContrast.toFixed(1)}%`, rightX + 12, prevY + 124);

      // Status pill badge
      const badgeY = prevY + 134;
      ctx.font = '800 11px Segoe UI, Arial';
      const badgeW = ctx.measureText(contrastStatus).width + 16;
      ctx.fillStyle = statusBg;
      drawRoundRect(ctx, rightX + 12, badgeY, badgeW, 22, 5);
      ctx.fill();
      ctx.strokeStyle = statusColor; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = statusColor;
      ctx.fillText(contrastStatus, rightX + 20, badgeY + 15);

      // Card 2: Quantitative Physics & Scatter Cleanup Breakdown
      const card2Y = prevY + prevH + 10;
      const card2H = h - card2Y - 14;
      ctx.fillStyle = '#071a2b';
      drawRoundRect(ctx, rightX, card2Y, rightW, card2H, 8);
      ctx.fill();
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#f4c76a'; ctx.font = '700 12px Segoe UI, Arial';
      ctx.fillText('SCATTER PHYSICS & DOSE ANALYSIS', rightX + 12, card2Y + 18);

      const rowY0 = card2Y + 38;
      const rowDy = 23;
      const labelX = rightX + 12;
      const valX = rightX + 135;

      // Row 1: Irradiated Volume
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Irradiated Volume:', labelX, rowY0);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#f8fafc';
      const volCm3 = Math.round(v.field * v.field * v.thickness);
      ctx.fillText(`${volCm3} cm³ (${v.field}×${v.field} cm² × ${v.thickness} cm)`, valX, rowY0);

      // Row 2: Scatter Produced
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Scatter Production:', labelX, rowY0 + rowDy);
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = sprBefore > 1.2 ? '#f87171' : sprBefore > 0.6 ? '#f59e0b' : '#34d399';
      ctx.fillText(`${sprBefore.toFixed(2)} SPR (at patient exit)`, valX, rowY0 + rowDy);

      // Row 3: Grid Scatter Cleanup
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Grid Cleanup:', labelX, rowY0 + rowDy * 2);
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = gridRatio > 0 ? '#38bdf8' : '#94a3b8';
      const cleanupPct = gridRatio === 0 ? 0 : Math.round((1 - 1 / (1 + gridRatio * 0.12)) * 100);
      ctx.fillText(gridRatio === 0 ? '0% (No Grid — Tabletop)' : `${cleanupPct}% absorbed by lead strips`, valX, rowY0 + rowDy * 2);

      // Row 4: Residual SPR at Receptor
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Residual SPR at IR:', labelX, rowY0 + rowDy * 3);
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = residualSpr > 0.6 ? '#f87171' : residualSpr > 0.2 ? '#f59e0b' : '#34d399';
      ctx.fillText(`${residualSpr.toFixed(2)} SPR remaining at receptor`, valX, rowY0 + rowDy * 3);

      // Row 5: Contrast Improvement Factor (CIF)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Contrast Factor (CIF):', labelX, rowY0 + rowDy * 4);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#34d399';
      ctx.fillText(`${contrastImprovement.toFixed(2)}× contrast improvement`, valX, rowY0 + rowDy * 4);

      // Row 6: Bucky Factor (Exposure Penalty)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Bucky Factor (mAs ↑):', labelX, rowY0 + rowDy * 5);
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = buckyFactor > 3.5 ? '#f87171' : '#f59e0b';
      ctx.fillText(`${buckyFactor.toFixed(2)}× patient exposure compensation`, valX, rowY0 + rowDy * 5);

    } else if (type === 'noise') {
      const detectedQuanta = Math.max(1, v.mas * 850 * v.detector);
      const quantumSd = v.signal / Math.sqrt(detectedQuanta / 25);
      const totalSd = Math.sqrt(quantumSd * quantumSd + v.intrinsic * v.intrinsic);
      const snr = Number(result.metrics[2].value);
      const cnr = Number(result.metrics[3].value);
      const isQuantumDominant = quantumSd >= v.intrinsic;

      // Layout split: Left = Anatomical Phantom & Image Area (0..590), Right = Signal & Noise Decomposition Dashboard (605..w-15)
      const chamberW = Math.min(590, w * 0.59);
      const rightX = chamberW + 15;
      const rightW = w - rightX - 15;

      // Vertical Divider
      ctx.strokeStyle = '#1e384c'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(rightX - 8, 30); ctx.lineTo(rightX - 8, h - 20); ctx.stroke();
      ctx.setLineDash([]);

      // --- LEFT PANEL: SIMULATED RADIOGRAPH & ANATOMICAL PHANTOM ---
      const imgX = 20;
      const imgY = 36;
      const imgW = chamberW - 20;
      const imgH = h - 90;

      ctx.fillStyle = '#081c2c';
      drawRoundRect(ctx, imgX, imgY, imgW, imgH, 8);
      ctx.fill();
      ctx.strokeStyle = '#224866'; ctx.lineWidth = 1.5; ctx.stroke();

      // Title & Annotation
      ctx.fillStyle = '#6ed5cf'; ctx.font = '700 12px Segoe UI, Arial';
      ctx.fillText('SIMULATED RADIOGRAPH (TRABECULAR BONE & NODULE)', imgX + 12, imgY + 18);

      // Procedural Pixel Generation with Poisson Quantum Mottle + Intrinsic Noise
      const pX = imgX + 10;
      const pY = imgY + 28;
      const pW = imgW - 20;
      const pH = imgH - 38;

      const imgData = ctx.createImageData(pW, pH);
      const data = imgData.data;

      // Seed PRNG for reproducible frame noise
      const seed = Math.round(v.mas * 1337 + v.signal * 53 + v.detector * 997 + v.intrinsic * 101);
      const rng = mulberry32(seed);

      const noduleCenterX = pW * 0.52;
      const noduleCenterY = pH * 0.50;
      const noduleRadius = Math.min(26, pH * 0.28);

      for (let y = 0; y < pH; y++) {
        for (let x = 0; x < pW; x++) {
          const idx = (y * pW + x) * 4;

          // Baseline anatomical tissue signal
          let baseSig = 115;

          // Trabecular bone structure grid
          if ((x % 22 < 3 && y % 16 < 12) || (y % 26 < 3 && x % 18 < 14)) {
            baseSig = 158;
          }

          // Subtle Low-Contrast Soft Tissue Nodule (Target Object)
          const dist = Math.hypot(x - noduleCenterX, y - noduleCenterY);
          if (dist < noduleRadius) {
            // Signal difference deltaS proportional to object signal
            const noduleProfile = Math.cos((dist / noduleRadius) * (Math.PI / 2));
            baseSig += (v.signal * 0.28) * noduleProfile;
          }

          // Add simulated stochastic noise (Quantum Poisson + Intrinsic Electronic)
          // Box-Muller normal distribution for authentic pixel standard deviation
          const u1 = Math.max(1e-6, rng());
          const u2 = rng();
          const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

          const pixelVal = clamp(Math.round(baseSig + z0 * totalSd * 3.8), 0, 255);

          data[idx] = pixelVal;
          data[idx + 1] = pixelVal;
          data[idx + 2] = pixelVal;
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, pX, pY);
      ctx.strokeStyle = '#1e3a4f'; ctx.lineWidth = 1; ctx.strokeRect(pX, pY, pW, pH);

      // Draw ROI Target Ring around Nodule
      ctx.strokeStyle = snr >= 5 ? '#10b981' : '#f59e0b';
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(pX + noduleCenterX, pY + noduleCenterY, noduleRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = snr >= 5 ? '#10b981' : '#f59e0b';
      ctx.font = '700 10px Segoe UI, Arial';
      ctx.fillText('Target Nodule ROI', pX + noduleCenterX - 42, pY + noduleCenterY - noduleRadius - 6);

      // Bottom Bar on Left Panel: Rose Criterion & Contrast-to-Noise Readout
      const btmY = h - 38;
      ctx.fillStyle = '#081c2c';
      drawRoundRect(ctx, imgX, btmY, imgW, 30, 6);
      ctx.fill();
      ctx.strokeStyle = '#224866'; ctx.lineWidth = 1; ctx.stroke();

      const roseMet = snr >= 5.0;
      ctx.fillStyle = roseMet ? '#10b981' : '#ef4444';
      ctx.beginPath(); ctx.arc(imgX + 16, btmY + 15, 5, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#fff'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText(`Rose Criterion (SNR ≥ 5): ${roseMet ? 'MET (Confidently Visible)' : 'UNMET (Mottle Degraded)'}`, imgX + 28, btmY + 19);

      ctx.fillStyle = '#38bdf8'; ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillText(`CNR: ${cnr.toFixed(2)}`, imgX + imgW - 80, btmY + 19);

      // --- RIGHT PANEL: SIGNAL & NOISE DECOMPOSITION DASHBOARD ---
      // Card 1: Photon Statistics & Object Signal
      const card1Y = 36;
      const card1H = 165;
      ctx.fillStyle = '#081c2c';
      drawRoundRect(ctx, rightX, card1Y, rightW, card1H, 8);
      ctx.fill();
      ctx.strokeStyle = '#224866'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#f4c76a'; ctx.font = '700 12px Segoe UI, Arial';
      ctx.fillText('OBJECT SIGNAL & PHOTON STATISTICS', rightX + 12, card1Y + 18);

      const r1Y0 = card1Y + 38;
      const r1Dy = 24;
      const lblX = rightX + 12;
      const vX = rightX + 135;

      // Row 1: Object Signal (a.u.)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Object Signal (S):', lblX, r1Y0);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${v.signal} a.u. (Transmitted intensity)`, vX, r1Y0);

      // Row 2: Tube mAs
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Exposure (mAs):', lblX, r1Y0 + r1Dy);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${v.mas} mAs (Incident photon fluence)`, vX, r1Y0 + r1Dy);

      // Row 3: Detector DQE
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Detector DQE:', lblX, r1Y0 + r1Dy * 2);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#34d399';
      ctx.fillText(`${(v.detector * 100).toFixed(0)}% (${v.detector} SNR transfer)`, vX, r1Y0 + r1Dy * 2);

      // Row 4: Detected Quanta Index
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Detected Quanta:', lblX, r1Y0 + r1Dy * 3);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${Math.round(detectedQuanta)} a.u. (mAs × DQE)`, vX, r1Y0 + r1Dy * 3);

      // Card 2: Noise Decomposition & Signal-to-Noise Ratio
      const card2Y = card1Y + card1H + 10;
      const card2H = h - card2Y - 14;
      ctx.fillStyle = '#071a2b';
      drawRoundRect(ctx, rightX, card2Y, rightW, card2H, 8);
      ctx.fill();
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#6ed5cf'; ctx.font = '700 12px Segoe UI, Arial';
      ctx.fillText('NOISE DECOMPOSITION & SNR ANALYSIS', rightX + 12, card2Y + 18);

      const r2Y0 = card2Y + 36;
      const r2Dy = 23;

      // Row 1: Quantum Poisson Noise (sigma_q)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Quantum Noise (σ_q):', lblX, r2Y0);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = isQuantumDominant ? '#f59e0b' : '#94a3b8';
      ctx.fillText(`${quantumSd.toFixed(2)} a.u. (Poisson mottle)`, vX, r2Y0);

      // Row 2: Intrinsic Electronic Noise (sigma_int)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Intrinsic Noise (σ_int):', lblX, r2Y0 + r2Dy);
      ctx.font = '700 11px Segoe UI, Arial'; ctx.fillStyle = !isQuantumDominant ? '#f59e0b' : '#94a3b8';
      ctx.fillText(`${v.intrinsic.toFixed(2)} SD (Detector electronic)`, vX, r2Y0 + r2Dy);

      // Row 3: Total Combined Noise (sigma_total)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Total Noise SD (σ_tot):', lblX, r2Y0 + r2Dy * 2);
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = totalSd > 12 ? '#ef4444' : totalSd > 6 ? '#f59e0b' : '#34d399';
      ctx.fillText(`${totalSd.toFixed(2)} a.u. (√(σ_q² + σ_int²))`, vX, r2Y0 + r2Dy * 2);

      // Row 4: Signal-to-Noise Ratio (SNR)
      ctx.font = '600 11px Segoe UI, Arial'; ctx.fillStyle = '#94a3b8';
      ctx.fillText('Signal-to-Noise (SNR):', lblX, r2Y0 + r2Dy * 3);
      ctx.font = '700 11px Segoe UI, Arial';
      ctx.fillStyle = snr >= 5 ? '#10b981' : '#f87171';
      ctx.fillText(`${snr.toFixed(2)} (Mean Signal S / Total Noise σ)`, vX, r2Y0 + r2Dy * 3);

      // Dominant Noise Status Pill Badge
      const badgeY = r2Y0 + r2Dy * 4 - 2;
      const domText = isQuantumDominant ? '⚡ QUANTUM NOISE DOMINATES (Increase mAs or DQE to fix)' : '📟 INTRINSIC DETECTOR NOISE DOMINATES (Electronic noise floor)';
      ctx.font = '800 10.5px Segoe UI, Arial';
      const domW = ctx.measureText(domText).width + 16;
      ctx.fillStyle = isQuantumDominant ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)';
      drawRoundRect(ctx, lblX, badgeY, domW, 21, 4);
      ctx.fill();
      ctx.strokeStyle = isQuantumDominant ? '#f59e0b' : '#38bdf8'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = isQuantumDominant ? '#f59e0b' : '#38bdf8';
      ctx.fillText(domText, lblX + 8, badgeY + 14.5);

    } else if (type === 'fluoro') {
      const din = Math.max(9, Math.min(40, Number(v.field) || 23));
      const dist = Math.max(0.5, Math.min(4.0, Number(v.distance) || 2.0));
      const shieldPct = clamp(Number(v.shield) || 0, 0, 100);
      const timeVal = Number(v.time) || 5;
      const magFactor = 23 / din;
      const patientDoseRate = Math.pow(23 / din, 2);
      const minGain = Math.pow(din / 2.5, 2);
      const totalBrightnessGain = Math.round(minGain * 60);
      const operatorDose = (timeVal / 5) * patientDoseRate * (1 / (dist * dist)) * ((100 - shieldPct) / 100);
      const spatialResolution = 2.0 * magFactor;
      const isMag = din < 22.5;

      // Responsive Panel Geometry
      const p1W = Math.round(w * 0.35);
      const p2X = p1W + 12;
      const p2W = Math.round(w * 0.35);
      const p3X = p2X + p2W + 12;
      const p3W = w - p3X - 15;
      const pY = 34;
      const pH = h - 46;

      // =========================================================================
      // PANEL 1: IMAGE INTENSIFIER ELECTRON OPTICS (CROSS-SECTION)
      // =========================================================================
      ctx.fillStyle = '#061624';
      drawRoundRect(ctx, 15, pY, p1W - 8, pH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e3a4f'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#6ed5cf'; ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillText('1. IMAGE INTENSIFIER (ELECTRON OPTICS)', 24, pY + 16);

      const tubeL = p1W - 46;
      const tubeX0 = 26;
      const tubeY0 = pY + 28;
      const tubeH = pH - 58;
      const tubeMidY = tubeY0 + tubeH / 2;

      // Evacuated Glass Tube Envelope
      ctx.fillStyle = 'rgba(10,34,53,0.85)';
      ctx.beginPath();
      ctx.moveTo(tubeX0 + 16, tubeY0 + 6);
      ctx.lineTo(tubeX0 + tubeL - 32, tubeMidY - 26);
      ctx.lineTo(tubeX0 + tubeL, tubeMidY - 26);
      ctx.lineTo(tubeX0 + tubeL, tubeMidY + 26);
      ctx.lineTo(tubeX0 + tubeL - 32, tubeMidY + 26);
      ctx.lineTo(tubeX0 + 16, tubeY0 + tubeH - 6);
      ctx.quadraticCurveTo(tubeX0 - 2, tubeMidY, tubeX0 + 16, tubeY0 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.8; ctx.stroke();

      // Curved Entrance Phosphor (CsI:Na) & Photocathode
      const fullInputH = tubeH - 24;
      const activeInputH = clamp((din / 23) * (tubeH - 30), 28, fullInputH);
      const inX = tubeX0 + 12;

      // Inactive peripheral phosphor boundary (when in mag mode)
      if (isMag) {
        ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(inX, tubeMidY - fullInputH / 2);
        ctx.lineTo(inX, tubeMidY + fullInputH / 2);
        ctx.stroke();
      }

      // Active CsI Entrance Phosphor (Golden Yellow)
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(inX, tubeMidY - activeInputH / 2);
      ctx.quadraticCurveTo(inX + 8, tubeMidY, inX, tubeMidY + activeInputH / 2);
      ctx.stroke();

      // Antimony-Cesium Photocathode (Cyan Layer)
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(inX + 3, tubeMidY - activeInputH / 2);
      ctx.quadraticCurveTo(inX + 10, tubeMidY, inX + 3, tubeMidY + activeInputH / 2);
      ctx.stroke();

      ctx.fillStyle = '#fef08a'; ctx.font = '700 9.5px Segoe UI, Arial';
      ctx.fillText(`Input CsI: ${din} cm`, inX - 2, tubeMidY - activeInputH / 2 - 4);

      // Electrostatic Focusing Lenses (E1, E2, E3 Ring Electrodes)
      const lensVolt = Math.round(25 + (23 - Math.min(23, din)) * 0.75);
      const e1X = tubeX0 + tubeL * 0.30;
      const e2X = tubeX0 + tubeL * 0.55;

      ctx.fillStyle = '#0ea5e9';
      // Lens E1 Top & Bottom
      drawRoundRect(ctx, e1X, tubeY0 + 12, 14, 7, 2); ctx.fill();
      drawRoundRect(ctx, e1X, tubeY0 + tubeH - 19, 14, 7, 2); ctx.fill();
      // Lens E2 Top & Bottom
      drawRoundRect(ctx, e2X, tubeMidY - 32, 12, 6, 2); ctx.fill();
      drawRoundRect(ctx, e2X, tubeMidY + 26, 12, 6, 2); ctx.fill();

      // Lens Voltage Indicator
      ctx.fillStyle = '#38bdf8'; ctx.font = '700 9px Segoe UI, Arial';
      ctx.fillText(`Focus Lens: +${lensVolt} kV`, e1X - 12, tubeY0 + 10);

      // Dynamic Electron Crossover Point (shifts closer to photocathode in Mag mode)
      const crossShift = (23 - din) * 1.8;
      const crossX = tubeX0 + tubeL * 0.58 - crossShift;
      const outX = tubeX0 + tubeL - 4;
      const outH = 24; // 2.5 cm output phosphor

      // Electron Ray Paths (Cyan Glowing Trajectories)
      const numRays = 7;
      ctx.lineWidth = 1.1;
      for (let r = 0; r < numRays; r++) {
        const frac = numRays === 1 ? 0.5 : (r / (numRays - 1) - 0.5) * 2;
        const startY = tubeMidY + frac * (activeInputH / 2) * 0.94;
        const targetOutY = tubeMidY - frac * (outH / 2) * 0.90; // Inversion at output

        ctx.strokeStyle = isMag ? 'rgba(56,189,248,0.85)' : 'rgba(110,213,207,0.7)';
        ctx.beginPath();
        ctx.moveTo(inX + 4, startY);
        ctx.bezierCurveTo(e1X, startY * 0.7 + tubeMidY * 0.3, crossX - 15, tubeMidY, crossX, tubeMidY);
        ctx.bezierCurveTo(crossX + 15, tubeMidY, outX - 12, targetOutY, outX, targetOutY);
        ctx.stroke();
      }

      // Focal Crossover Node
      ctx.fillStyle = '#f4c76a';
      ctx.beginPath(); ctx.arc(crossX, tubeMidY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fef08a'; ctx.font = '600 8.5px Segoe UI, Arial';
      ctx.fillText('Focal Point', crossX - 20, tubeMidY + 12);

      // Anode (+) Hole & Output Phosphor (ZnCdS:Ag, 2.5 cm)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(outX - 8, tubeMidY - 20, 3, 14);
      ctx.fillRect(outX - 8, tubeMidY + 6, 3, 14);

      // Glowing Green Output Phosphor
      ctx.fillStyle = '#10b981';
      ctx.fillRect(outX, tubeMidY - outH / 2, 4, outH);
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 1;
      ctx.strokeRect(outX, tubeMidY - outH / 2, 4, outH);

      // Output light beam emission
      const lightGrad = ctx.createLinearGradient(outX + 4, tubeMidY, outX + 18, tubeMidY);
      lightGrad.addColorStop(0, 'rgba(52,211,153,0.8)');
      lightGrad.addColorStop(1, 'rgba(52,211,153,0.0)');
      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.moveTo(outX + 4, tubeMidY - outH / 2);
      ctx.lineTo(outX + 18, tubeMidY - outH);
      ctx.lineTo(outX + 18, tubeMidY + outH);
      ctx.lineTo(outX + 4, tubeMidY + outH / 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#34d399'; ctx.font = '700 9px Segoe UI, Arial';
      ctx.fillText('Output: 2.5 cm', outX - 30, tubeMidY - outH / 2 - 4);

      // Bottom Metrics Strip for Tube
      ctx.fillStyle = 'rgba(15,41,61,0.92)';
      drawRoundRect(ctx, 22, pY + pH - 24, p1W - 22, 20, 4);
      ctx.fill();
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#b8eff0'; ctx.font = '700 9.5px Segoe UI, Arial';
      ctx.fillText(`Minification: ${minGain.toFixed(1)}× · Total Gain: ${totalBrightnessGain.toLocaleString()}×`, 28, pY + pH - 10.5);

      // =========================================================================
      // PANEL 2: FLUOROSCOPY ROOM, C-ARM & SCATTER ALARA STUDIO
      // =========================================================================
      ctx.fillStyle = '#061624';
      drawRoundRect(ctx, p2X, pY, p2W, pH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e3a4f'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#f4c76a'; ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillText('2. C-ARM & SCATTER RADIATION (ALARA)', p2X + 10, pY + 16);

      // Suite Architecture: Under-Table Tube & Patient Table
      const cArmCenter = p2X + 75;
      const tableY = pY + pH * 0.56;
      const tableW = 100;
      const tableLeft = cArmCenter - 48;

      // 1. Under-Table X-ray Tube
      const underTubeY = pY + pH - 32;
      ctx.fillStyle = '#1e293b';
      drawRoundRect(ctx, cArmCenter - 22, underTubeY, 44, 16, 4);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(cArmCenter, underTubeY + 4, 3, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#94a3b8'; ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillText('X-Ray Tube (Under-table)', cArmCenter - 46, underTubeY + 24);

      // 2. Primary Beam Cone passing upward
      const beamGrad = ctx.createLinearGradient(cArmCenter, underTubeY, cArmCenter, pY + 36);
      beamGrad.addColorStop(0, 'rgba(245,158,11,0.38)');
      beamGrad.addColorStop(0.5, 'rgba(245,158,11,0.22)');
      beamGrad.addColorStop(1, 'rgba(245,158,11,0.06)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(cArmCenter, underTubeY + 4);
      ctx.lineTo(cArmCenter - 26, pY + 44);
      ctx.lineTo(cArmCenter + 26, pY + 44);
      ctx.closePath();
      ctx.fill();

      // 3. Image Intensifier Tower above Patient
      const towerY = pY + 28;
      ctx.fillStyle = '#0f2b3f';
      drawRoundRect(ctx, cArmCenter - 28, towerY, 56, 24, 4);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#38bdf8'; ctx.font = '700 9px Segoe UI, Arial';
      ctx.fillText('II Tower', cArmCenter - 18, towerY + 16);

      // 4. Patient Table & Patient Phantom
      ctx.fillStyle = '#334155';
      ctx.fillRect(tableLeft, tableY, tableW, 6); // Tabletop
      ctx.strokeStyle = '#64748b'; ctx.strokeRect(tableLeft, tableY, tableW, 6);

      // Patient Body (Supine Torso)
      ctx.fillStyle = '#d97706';
      drawRoundRect(ctx, tableLeft + 12, tableY - 14, 76, 14, 5);
      ctx.fill();
      ctx.strokeStyle = '#fcd34d'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillText('Patient Phantom', tableLeft + 16, tableY - 4);

      // 5. Compton Scatter Isodose Cloud radiating from patient
      const scatterIntensity = clamp(patientDoseRate * 0.28, 0.15, 1.0);
      const isodoseR1 = 28 + scatterIntensity * 16;
      const isodoseR2 = 52 + scatterIntensity * 32;

      ctx.fillStyle = `rgba(239,68,68,${0.18 * scatterIntensity})`;
      ctx.beginPath(); ctx.arc(cArmCenter, tableY - 6, isodoseR1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(239,68,68,${0.45 * scatterIntensity})`; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(cArmCenter, tableY - 6, isodoseR1, 0, Math.PI * 2); ctx.stroke();

      ctx.fillStyle = `rgba(245,158,11,${0.10 * scatterIntensity})`;
      ctx.beginPath(); ctx.arc(cArmCenter, tableY - 6, isodoseR2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(245,158,11,${0.35 * scatterIntensity})`;
      ctx.beginPath(); ctx.arc(cArmCenter, tableY - 6, isodoseR2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // 6. Protective Shielding (Table Lead Drape & Ceiling-suspended Lead Acrylic)
      const shieldAlpha = clamp(shieldPct / 100, 0.08, 0.95);
      const shieldX = cArmCenter + 46;

      // Table-side lead curtain (hangs below tabletop)
      ctx.fillStyle = `rgba(100,116,139,${0.4 + shieldAlpha * 0.6})`;
      ctx.fillRect(tableLeft + tableW - 8, tableY + 6, 6, 26);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
      ctx.strokeRect(tableLeft + tableW - 8, tableY + 6, 6, 26);

      // Ceiling Articulated Shield (suspended between patient and operator)
      if (shieldPct > 0) {
        ctx.fillStyle = `rgba(56,189,248,${0.25 + shieldAlpha * 0.55})`;
        drawRoundRect(ctx, shieldX, tableY - 38, 7, 52, 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8'; ctx.font = '700 8px Segoe UI, Arial';
        ctx.fillText(`Lead Shield (${shieldPct}%)`, shieldX - 16, tableY - 42);
      }

      // 7. Interactive Movable Operator Figure
      const distNorm = (dist - 0.5) / 3.5; // 0.5m to 4.0m -> 0..1
      const opFloorX = p2X + 130 + distNorm * (p2W - 165);
      const opY = tableY - 24;

      // Dose Status Color for Operator
      const opColor = operatorDose > 0.8 ? '#ef4444' : operatorDose > 0.25 ? '#f59e0b' : '#10b981';

      // Operator Head & Body with Lead Apron
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath(); ctx.arc(opFloorX, opY - 14, 6, 0, Math.PI * 2); ctx.fill(); // Head

      // Body (Lead Apron)
      ctx.fillStyle = '#1e3a8a';
      drawRoundRect(ctx, opFloorX - 7, opY - 7, 14, 26, 3); ctx.fill();
      ctx.strokeStyle = opColor; ctx.lineWidth = 1.5; ctx.stroke();

      // Radiation Badge
      ctx.fillStyle = opColor;
      ctx.beginPath(); ctx.arc(opFloorX, opY, 2.5, 0, Math.PI * 2); ctx.fill();

      // Operator Label & Distance Marker
      ctx.fillStyle = '#fff'; ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillText(`Staff (${dist}m)`, opFloorX - 18, opY - 23);

      // Floor Distance Scale Line
      const scaleY = pY + pH - 24;
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cArmCenter, scaleY); ctx.lineTo(p2X + p2W - 10, scaleY); ctx.stroke();

      // Distance tick marks (0.5m, 1m, 2m, 3m, 4m)
      [0.5, 1.0, 2.0, 3.0, 4.0].forEach((dVal) => {
        const tx = p2X + 130 + ((dVal - 0.5) / 3.5) * (p2W - 165);
        ctx.strokeStyle = dVal === 1.0 || dVal === 2.0 ? '#38bdf8' : '#64748b';
        ctx.beginPath(); ctx.moveTo(tx, scaleY - 3); ctx.lineTo(tx, scaleY + 3); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.font = '600 7.5px Segoe UI, Arial';
        ctx.fillText(`${dVal}m`, tx - 6, scaleY + 12);
      });

      // Scatter Ray Interception vectors
      ctx.strokeStyle = opColor; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(cArmCenter, tableY - 4);
      ctx.lineTo(shieldPct > 40 ? shieldX : opFloorX - 4, opY);
      ctx.stroke();
      ctx.setLineDash([]);

      // =========================================================================
      // PANEL 3: REAL-TIME C-ARM FLUOROSCOPY DIAGNOSTIC DISPLAY MONITOR
      // =========================================================================
      ctx.fillStyle = '#061624';
      drawRoundRect(ctx, p3X, pY, p3W, pH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e3a4f'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#34d399'; ctx.font = '700 11.5px Segoe UI, Arial';
      ctx.fillText('3. LIVE FLUORO DISPLAY (C-ARM)', p3X + 10, pY + 16);

      // Medical Diagnostic Monitor Screen Area
      const monX = p3X + 10;
      const monY = pY + 26;
      const monW = p3W - 20;
      const monH = pH - 74;

      ctx.fillStyle = '#020617';
      drawRoundRect(ctx, monX, monY, monW, monH, 6);
      ctx.fill();
      ctx.strokeStyle = '#224866'; ctx.lineWidth = 1.5; ctx.stroke();

      // Circular Fluoroscopy Image Mask Area
      const monMidX = monX + monW / 2;
      const monMidY = monY + monH / 2;
      const monR = Math.min(monW * 0.44, monH * 0.44);

      ctx.save();
      ctx.beginPath();
      ctx.arc(monMidX, monMidY, monR, 0, Math.PI * 2);
      ctx.clip();

      // Background Soft-Tissue Grayscale
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(monMidX - monR, monMidY - monR, monR * 2, monR * 2);

      // Contrast-Filled Vascular Anatomy (Renal/Mesenteric Artery & Guidewire)
      // Scale anatomy zoom with magnification ratio
      const zoom = clamp(magFactor, 1.0, 2.6);

      ctx.save();
      ctx.translate(monMidX, monMidY);
      ctx.scale(zoom, zoom);

      // 1. Organ Parenchyma Outline (Kidney shadow)
      ctx.fillStyle = 'rgba(71,85,105,0.45)';
      ctx.beginPath();
      ctx.ellipse(-12, 0, 36, 48, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // 2. Main Contrast-Filled Arterial Trunk (Dense white radiopaque)
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 4.5 / zoom; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-35, 12);
      ctx.quadraticCurveTo(-15, 6, 0, 0);
      ctx.stroke();

      // 3. Primary Arterial Bifurcation Branches
      ctx.lineWidth = 3.0 / zoom;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, -14, 28, -22); // Superior polar branch
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(16, 12, 30, 24);   // Inferior branch
      ctx.stroke();

      // 4. Fine Microvascular Tertiary Branches (Resolved in Mag mode)
      const tertiaryAlpha = clamp((zoom - 1.0) / 0.8, 0.25, 1.0);
      ctx.strokeStyle = `rgba(248,250,252,${tertiaryAlpha})`;
      ctx.lineWidth = 1.6 / zoom;
      ctx.beginPath();
      ctx.moveTo(28, -22); ctx.lineTo(38, -28);
      ctx.moveTo(28, -22); ctx.lineTo(36, -16);
      ctx.moveTo(30, 24); ctx.lineTo(40, 22);
      ctx.moveTo(30, 24); ctx.lineTo(42, 32);
      ctx.stroke();

      // 5. Radiopaque Interventional Guidewire Tip
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.0 / zoom;
      ctx.beginPath();
      ctx.moveTo(-35, 12);
      ctx.quadraticCurveTo(-15, 6, 0, 0);
      ctx.lineTo(24, -19); // Wire positioned in branch
      ctx.stroke();
      ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(24, -19, 2.5 / zoom, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
      ctx.restore();

      // Fluoroscopic Aperture Ring
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(monMidX, monMidY, monR, 0, Math.PI * 2); ctx.stroke();

      // OSD Telemetry Overlay on Monitor
      ctx.fillStyle = '#10b981'; ctx.font = '700 8.5px var(--font-mono, monospace)';
      ctx.fillText('● LIVE FLUORO', monX + 6, monY + 12);

      ctx.fillStyle = '#f4c76a'; ctx.font = '600 8px var(--font-mono, monospace)';
      ctx.fillText(`FOV: ${din}cm (${magFactor.toFixed(2)}×)`, monX + 6, monY + 23);
      ctx.fillText(`ABC: ${(1.8 * patientDoseRate).toFixed(1)} mA`, monX + 6, monY + 33);

      ctx.fillStyle = patientDoseRate > 2.5 ? '#ef4444' : '#38bdf8';
      ctx.fillText(`ESE: ${(20 * patientDoseRate).toFixed(1)} mGy/min (${patientDoseRate.toFixed(2)}×)`, monX + 6, monY + monH - 14);
      ctx.fillStyle = '#34d399';
      ctx.fillText(`Res: ~${spatialResolution.toFixed(1)} lp/mm`, monX + 6, monY + monH - 5);

      // Time & 5-minute Timer Alert
      if (timeVal >= 5) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`⏱ ${timeVal}.0m ⚠️5-MIN AUDIBLE`, monX + monW - 98, monY + 12);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`⏱ ${timeVal}.0m`, monX + monW - 42, monY + 12);
      }

      // Bottom Status Telemetry Card
      const statY = pY + pH - 42;
      ctx.fillStyle = 'rgba(15,41,61,0.92)';
      drawRoundRect(ctx, p3X + 10, statY, p3W - 20, 36, 5);
      ctx.fill();
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = '#fff'; ctx.font = '700 9.5px Segoe UI, Arial';
      ctx.fillText(`Diagnostic Mode: ${isMag ? 'MAGNIFICATION' : 'NORMAL 23cm'}`, p3X + 16, statY + 14);

      ctx.fillStyle = isMag ? '#f59e0b' : '#38bdf8'; ctx.font = '600 8.5px Segoe UI, Arial';
      ctx.fillText(isMag ? `Patient Dose Rate: +${Math.round((patientDoseRate - 1) * 100)}% ↑ | Detail: +${Math.round((magFactor - 1) * 100)}% ↑` : 'Baseline Dose (1.00×) | Maximum Field of View', p3X + 16, statY + 28);

    } else if (type === 'digital') {
      const detectorPitch = Number(v.pitch);
      const matrixSize = Math.max(1, Number(v.matrix));
      const fovCm = Number(v.fov);
      const fovMm = fovCm * 10;
      const matrixPitch = fovMm / matrixSize;
      const effectivePitch = Math.max(detectorPitch, matrixPitch);
      const samplingFreq = 1 / effectivePitch;
      const nyquist = samplingFreq / 2; // f_N in lp/mm
      const recMode = Math.round(v.receptor);

      const mtfFactor = recMode === 0 ? 0.70 : (recMode >= 2 ? 0.95 : 0.85);
      const effectiveResolution = nyquist * mtfFactor;
      const minResolvableUm = Math.round((1 / (2 * Math.max(0.01, effectiveResolution))) * 1000);
      const fillFactor = recMode === 0 ? 100 : (recMode >= 2 ? clamp(Math.round((1.0 - 0.032 / detectorPitch) * 100), 55, 92) : clamp(Math.round((1.0 - 0.038 / detectorPitch) * 100), 50, 88));

      const isMatrixLimited = matrixPitch > detectorPitch * 1.15;
      const isDetectorLimited = detectorPitch > matrixPitch * 1.15;

      const chamberH = 292;
      const topY = 48;

      // =========================================================================
      // 1. LEFT CHAMBER: RECEPTOR PHYSICAL CONVERSION & DEL MICROSTRUCTURE
      // =========================================================================
      const c1X = 16, c1W = 312;
      ctx.fillStyle = '#071a2b';
      drawRoundRect(ctx, c1X, topY, c1W, chamberH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1a3d54'; ctx.lineWidth = 1.5; ctx.stroke();

      // Header Badge
      let badgeBg = '#0284c7', badgeText = 'INDIRECT DR · CsI:Tl + a-Si';
      if (recMode === 0) { badgeBg = '#d97706'; badgeText = 'CR · PSP (BaFBr:Eu²⁺) LASER SCAN'; }
      else if (recMode >= 2) { badgeBg = '#7c3aed'; badgeText = 'DIRECT DR · a-Se + TFT E-FIELD'; }

      ctx.fillStyle = badgeBg;
      drawRoundRect(ctx, c1X + 10, topY + 8, c1W - 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 10.5px Segoe UI, Arial'; ctx.textAlign = 'center';
      ctx.fillText(badgeText, c1X + c1W / 2, topY + 22);
      ctx.textAlign = 'left';

      // Cross-section Drawing Box
      const csX = c1X + 10, csY = topY + 34, csW = c1W - 20, csH = 120;
      ctx.fillStyle = '#0a2238';
      drawRoundRect(ctx, csX, csY, csW, csH, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e4968'; ctx.lineWidth = 1; ctx.stroke();

      // Incident X-Ray Photons
      ctx.strokeStyle = '#f59e0b'; ctx.fillStyle = '#f59e0b'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const rx = csX + 25 + i * (csW - 50) / 3;
        ctx.beginPath();
        ctx.moveTo(rx, csY + 4);
        ctx.lineTo(rx - 2, csY + 10);
        ctx.lineTo(rx + 2, csY + 16);
        ctx.lineTo(rx, csY + 22);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(rx, csY + 25);
        ctx.lineTo(rx - 3, csY + 20);
        ctx.lineTo(rx + 3, csY + 20);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#fcd34d'; ctx.font = '700 9px Segoe UI, Arial';
      ctx.fillText('Incident X-Ray Photons (hν)', csX + 10, csY + 14);

      // Conversion Layer Stack
      const stackY = csY + 28, stackH = 58;
      if (recMode === 0) {
        // CR Phosphor Layer
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(csX + 6, stackY, csW - 12, stackH);
        ctx.strokeStyle = '#475569'; ctx.strokeRect(csX + 6, stackY, csW - 12, stackH);

        // Phosphor crystal grains
        ctx.fillStyle = '#64748b';
        for (let gx = csX + 12; gx < csX + csW - 16; gx += 10) {
          for (let gy = stackY + 6; gy < stackY + stackH - 6; gy += 10) {
            ctx.beginPath(); ctx.arc(gx + ((gy * 7) % 5), gy + ((gx * 3) % 4), 2.2, 0, Math.PI * 2); ctx.fill();
          }
        }

        // Red Stimulating Laser Beam (633 nm)
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(csX + 20, stackY - 4);
        ctx.lineTo(csX + 110, stackY + 24);
        ctx.stroke();

        // Blue-violet PSL light scatter cone
        const laserHitX = csX + 110, laserHitY = stackY + 24;
        const pslGrad = ctx.createRadialGradient(laserHitX, laserHitY, 2, laserHitX, laserHitY, 32);
        pslGrad.addColorStop(0, 'rgba(168,85,247,0.95)');
        pslGrad.addColorStop(0.5, 'rgba(147,51,234,0.45)');
        pslGrad.addColorStop(1, 'rgba(147,51,234,0.0)');
        ctx.fillStyle = pslGrad;
        ctx.beginPath(); ctx.arc(laserHitX, laserHitY, 32, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#ef4444'; ctx.font = '700 9px Segoe UI, Arial';
        ctx.fillText('🔴 Red Laser (633nm)', csX + 12, stackY + 12);
        ctx.fillStyle = '#c084fc';
        ctx.fillText('🟣 PSL Light Scatter Blur', csX + 12, stackY + stackH - 6);

      } else if (recMode >= 2) {
        // Direct DR (a-Se Photoconductor)
        // High voltage top bias electrode
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(csX + 6, stackY, csW - 12, 6);
        ctx.fillStyle = '#000'; ctx.font = '800 7.5px Segoe UI, Arial';
        ctx.fillText('+5000 V HIGH VOLTAGE BIAS ELECTRODE', csX + 14, stackY + 5);

        // a-Se photoconductor block
        ctx.fillStyle = '#3b0764';
        ctx.fillRect(csX + 6, stackY + 6, csW - 12, stackH - 6);
        ctx.strokeStyle = '#7e22ce'; ctx.strokeRect(csX + 6, stackY + 6, csW - 12, stackH - 6);

        // Vertical Electric Field Lines (zero lateral spread)
        ctx.strokeStyle = 'rgba(56,189,248,0.75)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]);
        for (let ex = csX + 16; ex < csX + csW - 16; ex += 16) {
          ctx.beginPath();
          ctx.moveTo(ex, stackY + 6);
          ctx.lineTo(ex, stackY + stackH);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Electron-hole pairs
        ctx.fillStyle = '#38bdf8'; ctx.font = '800 8.5px Segoe UI, Arial';
        for (let ex = csX + 24; ex < csX + csW - 20; ex += 32) {
          ctx.fillText('e⁻ ↓', ex, stackY + 24);
          ctx.fillText('h⁺ ↑', ex + 8, stackY + 40);
        }

        ctx.fillStyle = '#c084fc'; ctx.font = '700 8.5px Segoe UI, Arial';
        ctx.fillText('a-Se Layer: Zero Lateral Light Spread', csX + 10, stackY + stackH - 4);

      } else {
        // Indirect DR (CsI:Tl Needle Scintillator + a-Si)
        ctx.fillStyle = '#042f2e';
        ctx.fillRect(csX + 6, stackY, csW - 12, stackH - 12);

        // Columnar needle crystals
        for (let nx = csX + 8; nx < csX + csW - 14; nx += 7) {
          const needleGrad = ctx.createLinearGradient(nx, stackY, nx + 5, stackY);
          needleGrad.addColorStop(0, '#0d9488');
          needleGrad.addColorStop(0.5, '#14b8a6');
          needleGrad.addColorStop(1, '#0f766e');
          ctx.fillStyle = needleGrad;
          ctx.fillRect(nx, stackY, 5, stackH - 14);
        }

        // Green scintillation bursts inside needles
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.arc(csX + 70, stackY + 16, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(csX + 160, stackY + 22, 4, 0, Math.PI * 2); ctx.fill();

        // a-Si Photodiode layer
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(csX + 6, stackY + stackH - 12, csW - 12, 12);
        ctx.fillStyle = '#fff'; ctx.font = '700 8px Segoe UI, Arial';
        ctx.fillText('Amorphous Silicon (a-Si) Photodiode Layer', csX + 12, stackY + stackH - 3);
      }

      // Substrate base
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(csX + 6, stackY + stackH, csW - 12, csH - stackH - 28);
      ctx.fillStyle = '#94a3b8'; ctx.font = '600 8px Segoe UI, Arial';
      ctx.fillText(recMode === 0 ? 'Light Guide & PMT Pickup' : 'TFT Readout Substrate & Glass Base', csX + 12, csY + csH - 4);

      // Micro DEL Architecture Box
      const delBoxY = topY + 160, delBoxH = chamberH - 168;
      ctx.fillStyle = '#0a2238';
      drawRoundRect(ctx, csX, delBoxY, csW, delBoxH, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e4968'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = '#38bdf8'; ctx.font = '800 9.5px Segoe UI, Arial';
      ctx.fillText('ACTIVE MATRIX ARRAY · DEL MICROSTRUCTURE', csX + 8, delBoxY + 14);

      // Draw 2x2 DEL Grid
      const gridOriginX = csX + 12, gridOriginY = delBoxY + 22;
      const delRenderSize = 38;
      const sensFraction = Math.sqrt(fillFactor / 100);
      const sensSize = delRenderSize * sensFraction;

      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const dx = gridOriginX + col * (delRenderSize + 6);
          const dy = gridOriginY + row * (delRenderSize + 4);

          // DEL Boundary
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
          ctx.strokeRect(dx, dy, delRenderSize, delRenderSize);

          // Active Sensing Area
          ctx.fillStyle = recMode >= 2 ? 'rgba(168,85,247,0.45)' : (recMode === 1 ? 'rgba(56,189,248,0.45)' : 'rgba(245,158,11,0.35)');
          ctx.fillRect(dx + 1, dy + 1, sensSize, sensSize);
          ctx.strokeStyle = recMode >= 2 ? '#a855f7' : (recMode === 1 ? '#38bdf8' : '#f59e0b');
          ctx.strokeRect(dx + 1, dy + 1, sensSize, sensSize);

          // TFT & Capacitor non-sensing area
          if (recMode !== 0) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(dx + sensSize + 1, dy + sensSize + 1, delRenderSize - sensSize - 2, delRenderSize - sensSize - 2);
          }
        }
      }

      // DEL Telemetry Info next to grid
      const infoX = gridOriginX + (delRenderSize * 2) + 18;
      ctx.fillStyle = '#fff'; ctx.font = '700 9.5px Segoe UI, Arial';
      ctx.fillText(`DEL Pitch: ${round(detectorPitch * 1000, 0)} µm`, infoX, delBoxY + 34);

      ctx.fillStyle = '#94a3b8'; ctx.font = '600 8.5px Segoe UI, Arial';
      ctx.fillText(`Fill Factor: ${fillFactor}%`, infoX, delBoxY + 48);
      ctx.fillText(`Matrix Pixel: ${round(matrixPitch * 1000, 0)} µm`, infoX, delBoxY + 62);
      ctx.fillText(`Effective Pitch: ${round(effectivePitch * 1000, 0)} µm`, infoX, delBoxY + 76);

      // Conversion blur badge
      ctx.fillStyle = recMode >= 2 ? '#10b981' : (recMode === 1 ? '#38bdf8' : '#f59e0b');
      ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillText(recMode >= 2 ? '✓ Pristine MTF (a-Se E-Field)' : (recMode === 1 ? 'ℹ️ Low Light Spread (CsI Needles)' : '⚠️ Optical Diffusion (PSP Crystals)'), infoX, delBoxY + 92);

      // =========================================================================
      // 2. MIDDLE CHAMBER: LINE-PAIR RESOLUTION PHANTOM & NYQUIST SAMPLING
      // =========================================================================
      const c2X = 336, c2W = 338;
      ctx.fillStyle = '#071a2b';
      drawRoundRect(ctx, c2X, topY, c2W, chamberH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1a3d54'; ctx.lineWidth = 1.5; ctx.stroke();

      // Title
      ctx.fillStyle = '#fff'; ctx.font = '800 11px Segoe UI, Arial';
      ctx.fillText('LINE-PAIR RESOLUTION PHANTOM & NYQUIST LIMIT', c2X + 12, topY + 18);

      // Phantom groups definition (lp/mm)
      const lpGroups = [0.5, 1.0, 1.5, 2.0, 2.5, 3.5, 5.0];
      const phantomY = topY + 28;
      const rowH = 26;

      lpGroups.forEach((freq, idx) => {
        const ry = phantomY + idx * rowH;
        const barWidthMm = 1 / (2 * freq);

        // Group background row
        ctx.fillStyle = idx % 2 === 0 ? 'rgba(15,39,61,0.7)' : 'rgba(10,28,45,0.7)';
        ctx.fillRect(c2X + 8, ry, c2W - 16, rowH - 2);

        // Frequency Label
        ctx.fillStyle = '#94a3b8'; ctx.font = '700 9px Segoe UI, Arial';
        ctx.fillText(`${freq.toFixed(1)} lp/mm`, c2X + 12, ry + 15);
        ctx.fillStyle = '#64748b'; ctx.font = '600 8px Segoe UI, Arial';
        ctx.fillText(`(${round(barWidthMm * 1000, 0)}µm)`, c2X + 62, ry + 15);

        // Bar Pattern Rendering
        const barAreaX = c2X + 115, barAreaW = 110;
        const numPairs = 4;
        const cycleWidthPx = barAreaW / numPairs;
        const halfCyclePx = cycleWidthPx / 2;

        const isResolved = freq <= nyquist * 0.88;
        const isCutoff = freq > nyquist * 0.88 && freq <= nyquist;
        const isAliased = freq > nyquist;

        // Effective Modulation
        let mod = Math.abs(Math.sin(Math.PI * freq * effectivePitch) / Math.max(0.001, Math.PI * freq * effectivePitch)) * mtfFactor;
        if (isCutoff) mod *= 0.45;
        if (isAliased) mod = 0.25;

        for (let p = 0; p < numPairs; p++) {
          const bx = barAreaX + p * cycleWidthPx;

          if (isAliased) {
            // Aliasing / Moiré artifact: false low-frequency beat pattern & phase distortion
            const beat = Math.sin((p / numPairs) * Math.PI * 3 + freq);
            const grayVal = clamp(Math.round(128 + beat * 70), 30, 225);
            ctx.fillStyle = `rgb(${grayVal},${grayVal},${grayVal})`;
            ctx.fillRect(bx, ry + 3, cycleWidthPx, rowH - 8);
          } else {
            // Alternating line pairs with contrast attenuation
            const whiteVal = clamp(Math.round(128 + mod * 127), 130, 255);
            const blackVal = clamp(Math.round(128 - mod * 127), 0, 126);

            ctx.fillStyle = `rgb(${whiteVal},${whiteVal},${whiteVal})`;
            ctx.fillRect(bx, ry + 3, halfCyclePx, rowH - 8);

            ctx.fillStyle = `rgb(${blackVal},${blackVal},${blackVal})`;
            ctx.fillRect(bx + halfCyclePx, ry + 3, halfCyclePx, rowH - 8);
          }
        }

        // Status Indicator Badge
        const statX = barAreaX + barAreaW + 10;
        if (isResolved) {
          ctx.fillStyle = '#10b981'; ctx.font = '700 8.5px Segoe UI, Arial';
          ctx.fillText('✓ Resolved', statX, ry + 15);
        } else if (isCutoff) {
          ctx.fillStyle = '#f59e0b'; ctx.font = '700 8.5px Segoe UI, Arial';
          ctx.fillText('⚠️ Limit (f_N)', statX, ry + 15);
        } else {
          ctx.fillStyle = '#ef4444'; ctx.font = '700 8.5px Segoe UI, Arial';
          ctx.fillText('✕ Moiré / Alias', statX, ry + 15);
        }
      });

      // Nyquist Frequency Spectrum Strip (Bottom of Chamber 2)
      const specY = topY + chamberH - 74, specW = c2W - 24, specH = 18;
      const specX = c2X + 12;

      ctx.fillStyle = '#0a2238';
      drawRoundRect(ctx, specX - 2, specY - 14, specW + 4, 64, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e4968'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = '#38bdf8'; ctx.font = '700 9px Segoe UI, Arial';
      ctx.fillText(`SPATIAL FREQUENCY SPECTRUM (0 to 6.0 lp/mm)`, specX, specY - 4);

      // Spectrum bar
      const maxFreqAxis = 6.0;
      const nyqPx = clamp((nyquist / maxFreqAxis) * specW, 0, specW);

      // Resolved Bandwidth (Green)
      ctx.fillStyle = '#059669';
      ctx.fillRect(specX, specY, nyqPx, specH);

      // Aliased Domain (Red Hashed)
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(specX + nyqPx, specY, specW - nyqPx, specH);

      // Hash lines in red zone
      ctx.strokeStyle = 'rgba(254,202,202,0.4)'; ctx.lineWidth = 1;
      for (let hx = specX + nyqPx + 4; hx < specX + specW; hx += 8) {
        ctx.beginPath(); ctx.moveTo(hx, specY); ctx.lineTo(hx + 8, specY + specH); ctx.stroke();
      }

      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
      ctx.strokeRect(specX, specY, specW, specH);

      // Nyquist Cursor Marker
      ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(specX + nyqPx, specY - 3);
      ctx.lineTo(specX + nyqPx, specY + specH + 3);
      ctx.stroke();

      // Arrow down
      ctx.beginPath();
      ctx.moveTo(specX + nyqPx, specY - 1);
      ctx.lineTo(specX + nyqPx - 4, specY - 6);
      ctx.lineTo(specX + nyqPx + 4, specY - 6);
      ctx.closePath(); ctx.fill();

      // Readouts below spectrum
      ctx.fillStyle = '#fcd34d'; ctx.font = '800 9.5px Segoe UI, Arial';
      ctx.fillText(`Nyquist Limit f_N = 1/(2p) = ${round(nyquist, 2)} lp/mm`, specX, specY + specH + 14);

      ctx.fillStyle = '#94a3b8'; ctx.font = '600 8.5px Segoe UI, Arial';
      ctx.fillText(`Resolved: <${round(nyquist, 2)} lp/mm | Aliased: >${round(nyquist, 2)} lp/mm`, specX, specY + specH + 26);

      // =========================================================================
      // 3. RIGHT CHAMBER: CLINICAL RADIOGRAPH DETAIL & MTF CURVE
      // =========================================================================
      const c3X = 682, c3W = 302;
      ctx.fillStyle = '#071a2b';
      drawRoundRect(ctx, c3X, topY, c3W, chamberH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1a3d54'; ctx.lineWidth = 1.5; ctx.stroke();

      // Sub-panel A: Simulated Radiograph Anatomy ROI (Trabecular Bone & Hairline Fracture)
      const radY = topY + 8, radH = 132, radW = c3W - 16, radX = c3X + 8;
      ctx.fillStyle = '#0a2238';
      drawRoundRect(ctx, radX, radY, radW, radH, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e4968'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = '#6ed5cf'; ctx.font = '700 9.5px Segoe UI, Arial';
      ctx.fillText('SIMULATED RADIOGRAPH · TRABECULAR BONE', radX + 8, radY + 13);

      // Procedural pixel canvas for anatomical simulation
      const pCanvasX = radX + 6, pCanvasY = radY + 18, pCanvasW = radW - 12, pCanvasH = radH - 26;
      const pixelBlockSize = clamp(Math.round(effectivePitch * 24), 2, 14);

      // Seed for deterministic structure
      const rng = mulberry32(112024);

      for (let py = 0; py < pCanvasH; py += pixelBlockSize) {
        for (let px = 0; px < pCanvasW; px += pixelBlockSize) {
          const normX = px / pCanvasW;
          const normY = py / pCanvasH;

          // Background soft tissue signal
          let sig = 70;

          // Cortical bone border on left
          if (normX < 0.22) {
            sig = 195 - normX * 200;
          }

          // Trabecular bone lattice struts
          const trabGrid1 = (Math.sin(normX * 28 + normY * 18) > 0.45);
          const trabGrid2 = (Math.cos(normX * 22 - normY * 26) > 0.40);
          if (normX >= 0.20 && (trabGrid1 || trabGrid2)) {
            sig += 75;
          }

          // Subtle hairline micro-fracture line (150 µm thickness)
          const fracDist = Math.abs((normX * 1.2 - normY * 0.8) - 0.28);
          const fractureVisible = effectivePitch <= 0.22;
          if (normX > 0.24 && normX < 0.75 && fracDist < 0.025 && fractureVisible) {
            sig = Math.max(30, sig - 80); // Radiolucent dark fracture line
          }

          // Receptor blur effect
          if (recMode === 0) sig = sig * 0.85 + 20; // CR laser scatter contrast reduction

          const pixelVal = clamp(Math.round(sig), 0, 255);
          ctx.fillStyle = `rgb(${pixelVal},${pixelVal},${pixelVal})`;
          ctx.fillRect(pCanvasX + px, pCanvasY + py, pixelBlockSize, pixelBlockSize);

          if (pixelBlockSize >= 5) {
            ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.5;
            ctx.strokeRect(pCanvasX + px, pCanvasY + py, pixelBlockSize, pixelBlockSize);
          }
        }
      }

      // Micro-fracture ROI Callout
      if (effectivePitch <= 0.22) {
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
        ctx.strokeRect(pCanvasX + 35, pCanvasY + 22, 55, 45);
        ctx.setLineDash([]);
        ctx.fillStyle = '#10b981'; ctx.font = '700 8px Segoe UI, Arial';
        ctx.fillText('✓ Hairline Fracture', pCanvasX + 37, pCanvasY + 18);
      } else {
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
        ctx.strokeRect(pCanvasX + 35, pCanvasY + 22, 55, 45);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ef4444'; ctx.font = '700 8px Segoe UI, Arial';
        ctx.fillText('✕ Fracture Blurred', pCanvasX + 37, pCanvasY + 18);
      }

      // Sub-panel B: Modulation Transfer Function (MTF) Curve Graph
      const mtfGraphY = topY + 146, mtfGraphH = chamberH - 154, mtfGraphW = radW, mtfGraphX = radX;
      ctx.fillStyle = '#0a2238';
      drawRoundRect(ctx, mtfGraphX, mtfGraphY, mtfGraphW, mtfGraphH, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e4968'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = '#f4c76a'; ctx.font = '700 9.5px Segoe UI, Arial';
      ctx.fillText('MODULATION TRANSFER FUNCTION (MTF)', mtfGraphX + 8, mtfGraphY + 13);

      // Graph Coordinates
      const gX = mtfGraphX + 28, gY = mtfGraphY + 20, gW = mtfGraphW - 36, gH = mtfGraphH - 42;

      // Axis lines
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gX, gY); ctx.lineTo(gX, gY + gH); ctx.lineTo(gX + gW, gY + gH);
      ctx.stroke();

      // Axis ticks & labels
      ctx.fillStyle = '#94a3b8'; ctx.font = '600 7.5px Segoe UI, Arial';
      ctx.fillText('100%', gX - 22, gY + 4);
      ctx.fillText('50%', gX - 18, gY + gH / 2 + 3);
      ctx.fillText('0%', gX - 14, gY + gH + 2);

      ctx.fillText('0', gX - 2, gY + gH + 11);
      ctx.fillText('2', gX + (2 / 6) * gW - 2, gY + gH + 11);
      ctx.fillText('4', gX + (4 / 6) * gW - 2, gY + gH + 11);
      ctx.fillText('6 lp/mm', gX + gW - 26, gY + gH + 11);

      // 10% MTF Limiting Threshold Line
      const y10 = gY + gH * 0.90;
      ctx.strokeStyle = 'rgba(245,158,11,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(gX, y10); ctx.lineTo(gX + gW, y10); ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.font = '600 7px Segoe UI, Arial';
      ctx.fillText('10% Threshold (R₁₀%)', gX + 4, y10 - 2);

      // Nyquist limit vertical line
      const xNyq = gX + clamp((nyquist / 6.0) * gW, 0, gW);
      ctx.strokeStyle = 'rgba(56,189,248,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xNyq, gY); ctx.lineTo(xNyq, gY + gH); ctx.stroke();
      ctx.setLineDash([]);

      // Draw MTF Curve
      const curveGrad = ctx.createLinearGradient(gX, gY, gX, gY + gH);
      curveGrad.addColorStop(0, 'rgba(56,189,248,0.35)');
      curveGrad.addColorStop(1, 'rgba(56,189,248,0.0)');

      ctx.beginPath();
      ctx.moveTo(gX, gY);
      for (let px = 0; px <= gW; px += 2) {
        const f = (px / gW) * 6.0;
        const sinc = f === 0 ? 1.0 : Math.abs(Math.sin(Math.PI * f * effectivePitch) / (Math.PI * f * effectivePitch));
        const matRoll = Math.exp(-Math.pow(f / (nyquist * (recMode >= 2 ? 1.4 : (recMode === 1 ? 1.1 : 0.85))), 1.6));
        const mtfVal = clamp(sinc * matRoll, 0, 1.0);
        const cy = gY + gH * (1.0 - mtfVal);
        ctx.lineTo(gX + px, cy);
      }
      ctx.lineTo(gX + gW, gY + gH);
      ctx.lineTo(gX, gY + gH);
      ctx.closePath();
      ctx.fillStyle = curveGrad; ctx.fill();

      // Stroke MTF line
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gX, gY);
      for (let px = 0; px <= gW; px += 2) {
        const f = (px / gW) * 6.0;
        const sinc = f === 0 ? 1.0 : Math.abs(Math.sin(Math.PI * f * effectivePitch) / (Math.PI * f * effectivePitch));
        const matRoll = Math.exp(-Math.pow(f / (nyquist * (recMode >= 2 ? 1.4 : (recMode === 1 ? 1.1 : 0.85))), 1.6));
        const mtfVal = clamp(sinc * matRoll, 0, 1.0);
        const cy = gY + gH * (1.0 - mtfVal);
        ctx.lineTo(gX + px, cy);
      }
      ctx.stroke();

      // MTF Summary Badge
      ctx.fillStyle = '#fff'; ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillText(`R₁₀% = ${round(effectiveResolution, 2)} lp/mm | f_N = ${round(nyquist, 2)} lp/mm`, gX + 18, gY + 12);

      // =========================================================================
      // 4. BOTTOM TELEMETRY STATUS BANNER
      // =========================================================================
      const statY = topY + chamberH + 6;
      ctx.fillStyle = 'rgba(15,41,61,0.95)';
      drawRoundRect(ctx, 16, statY, w - 32, 28, 5);
      ctx.fill();
      ctx.strokeStyle = '#28546a'; ctx.lineWidth = 1; ctx.stroke();

      let botBadgeBg = '#10b981', botBadgeText = '✓ MATCHED NYQUIST SAMPLING';
      let botDesc = `Matrix pixel (${round(matrixPitch * 1000, 0)} µm) and DEL pitch (${round(detectorPitch * 1000, 0)} µm) are balanced for optimal spatial sampling.`;

      if (isMatrixLimited) {
        botBadgeBg = '#f59e0b';
        botBadgeText = '⚠️ MATRIX BOTTLENECK';
        botDesc = `Matrix size (${matrixSize} px) across ${fovCm} cm FOV produces ${round(matrixPitch * 1000, 0)} µm pixels > DEL pitch (${round(detectorPitch * 1000, 0)} µm). Increase matrix to resolve finer detail.`;
      } else if (isDetectorLimited) {
        botBadgeBg = '#0284c7';
        botBadgeText = 'ℹ️ DETECTOR DEL BOTTLENECK';
        botDesc = `DEL pitch (${round(detectorPitch * 1000, 0)} µm) > matrix pixel (${round(matrixPitch * 1000, 0)} µm). Detector element dimensions constrain spatial resolution.`;
      }
      ctx.fillStyle = botBadgeBg;
      drawRoundRect(ctx, 22, statY + 4, 185, 20, 3);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 9px Segoe UI, Arial'; ctx.textAlign = 'center';
      ctx.fillText(botBadgeText, 22 + 185 / 2, statY + 17);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#e2e8f0'; ctx.font = '600 9px Segoe UI, Arial';
      ctx.fillText(botDesc, 215, statY + 17);

    } else if (type === 'window') {
      const ww = Math.max(10, Number(v.width) || 400);
      const wl = Number(v.level) || 40;
      const ei = Math.max(10, Number(v.exposure) || 100);
      const rawNoise = Math.max(0, Number(v.noise) || 8);

      const low = wl - ww / 2;
      const high = wl + ww / 2;
      const contrastGain = 255 / ww;
      const di = 10 * Math.log10(ei / 100);

      // Effective composite noise model: quantum mottle (inversely proportional to sqrt(EI)) + electronic/display noise
      const targetEI = 100;
      const qNoise = 16 * Math.sqrt(targetEI / ei);
      const effNoise = Math.sqrt(rawNoise * rawNoise + qNoise * qNoise);

      function mapHU(hu) {
        if (hu <= low) return 0;
        if (hu >= high) return 255;
        return Math.round(((hu - low) / ww) * 255);
      }

      // ==========================================
      // PANEL 1: Workstation Radiograph & Cross-Section Phantom
      // ==========================================
      const p1X = 20, p1Y = 48, p1W = 325, p1H = 290;
      ctx.fillStyle = '#061320';
      drawRoundRect(ctx, p1X, p1Y, p1W, p1H, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Panel 1 Header
      ctx.fillStyle = '#0e2438';
      drawRoundRect(ctx, p1X + 1, p1Y + 1, p1W - 2, 24, 7);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 10px Segoe UI, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('1 · WORKSTATION DISPLAY PHANTOM', p1X + 10, p1Y + 16);

      // Viewport Sub-Window
      const vpX = p1X + 10, vpY = p1Y + 30, vpW = p1W - 20, vpH = 220;
      ctx.fillStyle = '#020813';
      drawRoundRect(ctx, vpX, vpY, vpW, vpH, 6);
      ctx.fill();
      ctx.strokeStyle = '#152e4d';
      ctx.stroke();

      // Outer Torso Contour (Subcutaneous Fat: -90 HU)
      const centerX = vpX + vpW / 2;
      const centerY = vpY + vpH / 2 - 10;
      const fatGray = mapHU(-90);
      ctx.fillStyle = `rgb(${fatGray},${fatGray},${fatGray})`;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 130, 85, 0, 0, Math.PI * 2);
      ctx.fill();

      // Soft Tissue Mantle / Muscle (HU: +45)
      const stGray = mapHU(45);
      ctx.fillStyle = `rgb(${stGray},${stGray},${stGray})`;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 118, 75, 0, 0, Math.PI * 2);
      ctx.fill();

      // Right and Left Lung Fields (HU: -650)
      const lungGray = mapHU(-650);
      ctx.fillStyle = `rgb(${lungGray},${lungGray},${lungGray})`;
      // Right Lung
      ctx.beginPath();
      ctx.ellipse(centerX - 56, centerY - 8, 42, 54, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // Left Lung
      ctx.beginPath();
      ctx.ellipse(centerX + 56, centerY - 8, 42, 54, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Pulmonary Vascular Branching (+30 HU)
      const vGray = mapHU(30);
      ctx.strokeStyle = `rgb(${vGray},${vGray},${vGray})`;
      ctx.lineWidth = 1.5;
      // Right branches
      ctx.beginPath();
      ctx.moveTo(centerX - 35, centerY - 5);
      ctx.lineTo(centerX - 65, centerY - 25);
      ctx.moveTo(centerX - 35, centerY - 5);
      ctx.lineTo(centerX - 70, centerY + 15);
      ctx.moveTo(centerX - 50, centerY - 15);
      ctx.lineTo(centerX - 80, centerY - 10);
      // Left branches
      ctx.moveTo(centerX + 35, centerY - 5);
      ctx.lineTo(centerX + 65, centerY - 25);
      ctx.moveTo(centerX + 35, centerY - 5);
      ctx.lineTo(centerX + 70, centerY + 15);
      ctx.stroke();

      // Mediastinum / Heart Silhouette (+45 HU)
      ctx.fillStyle = `rgb(${stGray},${stGray},${stGray})`;
      ctx.beginPath();
      ctx.ellipse(centerX - 4, centerY - 4, 32, 46, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Thoracic Spine (Posterior)
      const spineY = centerY + 48;
      // Cortical bone rim (+850 HU)
      const cortGray = mapHU(850);
      ctx.fillStyle = `rgb(${cortGray},${cortGray},${cortGray})`;
      ctx.beginPath();
      ctx.ellipse(centerX, spineY, 20, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // Trabecular marrow core (+350 HU)
      const trabGray = mapHU(350);
      ctx.fillStyle = `rgb(${trabGray},${trabGray},${trabGray})`;
      ctx.beginPath();
      ctx.ellipse(centerX, spineY, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Anterior Sternum (+850 HU)
      ctx.fillStyle = `rgb(${cortGray},${cortGray},${cortGray})`;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 68, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Lateral Ribs (+850 HU)
      ctx.beginPath();
      ctx.ellipse(centerX - 108, centerY - 20, 6, 14, 0.3, 0, Math.PI * 2);
      ctx.ellipse(centerX + 108, centerY - 20, 6, 14, -0.3, 0, Math.PI * 2);
      ctx.ellipse(centerX - 102, centerY + 24, 7, 12, 0.4, 0, Math.PI * 2);
      ctx.ellipse(centerX + 102, centerY + 24, 7, 12, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Subtle Low-Contrast Focal Lesion (+65 HU) inside Right Lung Field
      const lesionGray = mapHU(65);
      ctx.fillStyle = `rgb(${lesionGray},${lesionGray},${lesionGray})`;
      ctx.beginPath();
      ctx.arc(centerX - 48, centerY + 18, 9, 0, Math.PI * 2);
      ctx.fill();
      // Lesion indicator dashed caliper
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(centerX - 48, centerY + 18, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // ==========================================
      // REALISTIC QUANTUM MOTTLE & DISPLAY NOISE OVERLAY
      // ==========================================
      const noiseSeed = Math.floor(ei * 41 + rawNoise * 67 + ww * 13 + wl * 7);
      const rng = mulberry32(noiseSeed);

      // Number of noise particles scales directly with effNoise and viewport area
      const grainCount = Math.round(500 + effNoise * 65); // 500 up to ~2800 particles
      const baseAlpha = clamp(effNoise / 36, 0.08, 0.75);

      for (let i = 0; i < grainCount; i++) {
        const nx = vpX + 4 + rng() * (vpW - 8);
        const ny = vpY + 4 + rng() * (vpH - 8);
        const isWhite = rng() > 0.48;
        const gSize = rng() > 0.88 ? 2.2 : rng() > 0.55 ? 1.6 : 1.0;
        const alpha = (0.06 + rng() * 0.38) * baseAlpha;
        ctx.fillStyle = isWhite ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(0,0,0,${alpha.toFixed(3)})`;
        ctx.fillRect(nx, ny, gSize, gSize);
      }

      // Lesion Noise Intrusion: when CNR is poor (< 3.8), quantum mottle intrudes over the lesion
      const deltaGray = Math.abs(lesionGray - stGray);
      const lesionCNR = deltaGray / Math.max(1, effNoise * 0.45);
      if (lesionCNR < 3.8) {
        const noduleGrains = Math.round((3.8 - lesionCNR) * 28);
        for (let k = 0; k < noduleGrains; k++) {
          const rx = centerX - 48 + (rng() - 0.5) * 24;
          const ry = centerY + 18 + (rng() - 0.5) * 24;
          const isW = rng() > 0.5;
          const nAlpha = (0.2 + rng() * 0.45) * baseAlpha;
          ctx.fillStyle = isW ? `rgba(255,255,255,${nAlpha.toFixed(2)})` : `rgba(0,0,0,${nAlpha.toFixed(2)})`;
          ctx.fillRect(rx, ry, 2, 2);
        }
      }

      // Live HUD Badge on Viewport Top-Right
      const hudW = 140, hudH = 34;
      const hudX = vpX + vpW - hudW - 6, hudY = vpY + 6;
      ctx.fillStyle = 'rgba(7, 22, 38, 0.85)';
      drawRoundRect(ctx, hudX, hudY, hudW, hudH, 4);
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillStyle = di > 1.0 ? '#fbbf24' : di < -1.0 ? '#f87171' : '#4ade80';
      ctx.textAlign = 'left';
      ctx.fillText(`EI: ${ei} (${di >= 0 ? '+' : ''}${di.toFixed(2)} DI)`, hudX + 6, hudY + 12);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 8px Segoe UI, Arial';
      ctx.fillText(`Noise: σ = ${effNoise.toFixed(1)} SD (Eff)`, hudX + 6, hudY + 22);
      ctx.fillStyle = effNoise > 24 ? '#f87171' : effNoise > 16 ? '#facc15' : '#67e8f9';
      ctx.fillText(effNoise > 24 ? '⚠️ High Quantum Mottle' : effNoise > 16 ? 'ℹ️ Moderate Grain' : '✓ Crisp / Low Noise', hudX + 6, hudY + 31);

      // ROI Micro-Labels
      ctx.font = '600 8.5px Segoe UI, Arial';
      ctx.fillStyle = '#67e8f9';
      ctx.fillText(`Bone: +850 HU (G:${cortGray})`, vpX + 6, vpY + 14);
      ctx.fillText(`Soft: +45 HU (G:${stGray})`, vpX + 6, vpY + 26);
      ctx.fillStyle = '#fde047';
      ctx.fillText(`Nodule: +65 HU (G:${lesionGray})`, vpX + 6, vpY + 38);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Lung: -650 HU (G:${lungGray})`, vpX + 6, vpY + 50);

      // Panel 1 Bottom Status Bar
      ctx.fillStyle = '#0b1e33';
      drawRoundRect(ctx, vpX, vpY + vpH + 6, vpW, 24, 4);
      ctx.fill();
      ctx.font = '700 9.5px Segoe UI, Arial';
      if (deltaGray < 8) {
        ctx.fillStyle = '#f87171';
        ctx.fillText('✗ Nodule: Clipped / Iso-dense (Zero Contrast)', vpX + 8, vpY + vpH + 22);
      } else if (lesionCNR < 2.5) {
        ctx.fillStyle = '#f87171';
        ctx.fillText(`✗ Nodule: Obscured by Quantum Mottle (CNR: ${lesionCNR.toFixed(2)})`, vpX + 8, vpY + vpH + 22);
      } else if (lesionCNR < 4.5) {
        ctx.fillStyle = '#facc15';
        ctx.fillText(`⚠️ Nodule: Marginal Conspicuity (CNR: ${lesionCNR.toFixed(2)})`, vpX + 8, vpY + vpH + 22);
      } else {
        ctx.fillStyle = '#4ade80';
        ctx.fillText(`✓ Nodule: Distinctly Resolved (CNR: ${lesionCNR.toFixed(2)} - Rose Met)`, vpX + 8, vpY + vpH + 22);
      }

      // ==========================================
      // PANEL 2: Dynamic Histogram & Active Passband
      // ==========================================
      const p2X = 355, p2Y = 48, p2W = 325, p2H = 290;
      ctx.fillStyle = '#061320';
      drawRoundRect(ctx, p2X, p2Y, p2W, p2H, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Panel 2 Header
      ctx.fillStyle = '#0e2438';
      drawRoundRect(ctx, p2X + 1, p2Y + 1, p2W - 2, 24, 7);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 10px Segoe UI, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('2 · HISTOGRAM & WINDOW PASSBAND', p2X + 10, p2Y + 16);

      const hX = p2X + 15, hY = p2Y + 32, hW = p2W - 30, hH = 175;
      ctx.fillStyle = '#030a14';
      ctx.fillRect(hX, hY, hW, hH);
      ctx.strokeStyle = '#152e4d';
      ctx.strokeRect(hX, hY, hW, hH);

      // Helper to map HU (-800 to +1000) to Histogram X
      function huToX(hu) {
        return hX + clamp(((hu - (-800)) / 1800) * hW, 0, hW);
      }

      const lowX = huToX(low);
      const highX = huToX(high);
      const levelX = huToX(wl);

      // Shaded Regions: Black Clip, Passband, White Saturation
      // 1. Black Clip Zone (< low)
      if (lowX > hX) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.fillRect(hX, hY, lowX - hX, hH);
      }
      // 2. Active Window Passband (low to high)
      const passW = Math.max(0, highX - lowX);
      if (passW > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.fillRect(lowX, hY, passW, hH);
      }
      // 3. White Saturation Zone (> high)
      if (highX < hX + hW) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.fillRect(highX, hY, (hX + hW) - highX, hH);
      }

      // Anatomical Histogram Distribution Curve with Noise Perturbation
      ctx.beginPath();
      ctx.moveTo(hX, hY + hH);
      const hNoiseSeed = Math.floor(ei * 17 + rawNoise * 31);
      const hrng = mulberry32(hNoiseSeed);

      // Gaussian peak widths broaden with effective noise
      const sigmaSpread = 1 + effNoise * 0.025;

      for (let px = 0; px <= hW; px += 2) {
        const hu = -800 + (px / hW) * 1800;
        // 5 Anatomical Peaks with noise dispersion
        const pLung = Math.exp(-Math.pow(hu - (-650), 2) / (8000 * sigmaSpread)) * (hH * 0.65);
        const pFat = Math.exp(-Math.pow(hu - (-90), 2) / (4000 * sigmaSpread)) * (hH * 0.45);
        const pSoft = Math.exp(-Math.pow(hu - 45, 2) / (7000 * sigmaSpread)) * (hH * 0.88);
        const pTrab = Math.exp(-Math.pow(hu - 350, 2) / (14000 * sigmaSpread)) * (hH * 0.42);
        const pCort = Math.exp(-Math.pow(hu - 850, 2) / (10000 * sigmaSpread)) * (hH * 0.55);

        // High-frequency noise ripple across the histogram envelope
        const noiseRipple = (hrng() - 0.5) * (effNoise * 0.35);
        const totalH = Math.max(2, pLung + pFat + pSoft + pTrab + pCort + 3 + noiseRipple);
        ctx.lineTo(hX + px, hY + hH - Math.min(hH - 5, totalH));
      }
      ctx.lineTo(hX + hW, hY + hH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Threshold Vertical Marker Lines
      // T_low Line
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lowX, hY);
      ctx.lineTo(lowX, hY + hH);
      ctx.stroke();

      // Window Level Center Line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(levelX, hY);
      ctx.lineTo(levelX, hY + hH);
      ctx.stroke();
      ctx.setLineDash([]);

      // T_high Line
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(highX, hY);
      ctx.lineTo(highX, hY + hH);
      ctx.stroke();

      // Zone Labels
      ctx.font = '700 8.5px Segoe UI, Arial';
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(`T_low: ${Math.round(low)}`, Math.max(hX + 4, lowX - 60), hY + 14);
      ctx.fillStyle = '#67e8f9';
      ctx.fillText(`WL: ${wl}`, clamp(levelX - 18, hX + 4, hX + hW - 40), hY + 28);
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText(`T_high: ${Math.round(high)}`, Math.min(hX + hW - 65, highX + 4), hY + 14);

      // Anatomical Axis Labels
      ctx.font = '600 8px Segoe UI, Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Lung (-650)', huToX(-650) - 20, hY + hH + 12);
      ctx.fillText('Fat', huToX(-90) - 6, hY + hH + 12);
      ctx.fillText('Soft (+45)', huToX(45) - 16, hY + hH + 12);
      ctx.fillText('Bone (+850)', huToX(850) - 22, hY + hH + 12);

      // Panel 2 Bottom Gauge Box
      ctx.fillStyle = '#0b1e33';
      drawRoundRect(ctx, hX, p2Y + 235, hW, 44, 4);
      ctx.fill();
      ctx.font = '600 9px Segoe UI, Arial';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`Active Passband: ${Math.round(low)} to ${Math.round(high)} HU (${ww} HU, G=${contrastGain.toFixed(2)} gray/HU)`, hX + 8, p2Y + 250);
      if (di > 1.0) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('⚠️ Exposure Creep: High signal masks patient dose on the monitor.', hX + 8, p2Y + 268);
      } else if (di < -1.0) {
        ctx.fillStyle = '#f87171';
        ctx.fillText('⚠️ Underexposure: Low photon statistics broaden peaks with quantum mottle.', hX + 8, p2Y + 268);
      } else if (ww < 150) {
        ctx.fillStyle = '#f87171';
        ctx.fillText('⚠️ Narrow Window: High contrast gradient; extensive tissue clipping.', hX + 8, p2Y + 268);
      } else {
        ctx.fillStyle = '#4ade80';
        ctx.fillText('✓ Diagnostic Window: Well-balanced tissue latitude, contrast & noise.', hX + 8, p2Y + 268);
      }

      // ==========================================
      // PANEL 3: Look-Up Table (LUT) & Diagnostic Scorecard
      // ==========================================
      const p3X = 690, p3Y = 48, p3W = 290, p3H = 290;
      ctx.fillStyle = '#061320';
      drawRoundRect(ctx, p3X, p3Y, p3W, p3H, 8);
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Panel 3 Header
      ctx.fillStyle = '#0e2438';
      drawRoundRect(ctx, p3X + 1, p3Y + 1, p3W - 2, 24, 7);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = '700 10px Segoe UI, Arial';
      ctx.fillText('3 · LUT TRANSFER CURVE & SCORECARD', p3X + 10, p3Y + 16);

      // LUT Graph Box
      const gX = p3X + 15, gY = p3Y + 30, gW = p3W - 30, gH = 100;
      ctx.fillStyle = '#030a14';
      ctx.fillRect(gX, gY, gW, gH);
      ctx.strokeStyle = '#152e4d';
      ctx.strokeRect(gX, gY, gW, gH);

      // LUT Axes & Grayscale Gradient Bar on Y-axis
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 8px Segoe UI, Arial';
      ctx.fillText('255 (White)', gX + 4, gY + 10);
      ctx.fillText('0 (Black)', gX + 4, gY + gH - 4);
      ctx.fillText('-800 HU', gX + 4, gY + gH + 10);
      ctx.fillText('+1000 HU', gX + gW - 38, gY + gH + 10);

      // Draw LUT Curve (Sigmoidal Linear Step Mapping)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gX, gY + gH);
      for (let px = 0; px <= gW; px += 2) {
        const hu = -800 + (px / gW) * 1800;
        const gVal = mapHU(hu);
        const yPos = gY + gH - (gVal / 255) * gH;
        ctx.lineTo(gX + px, yPos);
      }
      ctx.stroke();

      // Plot Tissue Dots on the LUT Curve
      const sampleTissues = [
        { name: 'Lung', hu: -650, col: '#38bdf8' },
        { name: 'Fat', hu: -90, col: '#a3e635' },
        { name: 'Soft', hu: 45, col: '#facc15' },
        { name: 'Bone', hu: 850, col: '#ffffff' }
      ];
      sampleTissues.forEach(t => {
        const tx = gX + clamp(((t.hu - (-800)) / 1800) * gW, 0, gW);
        const ty = gY + gH - (mapHU(t.hu) / 255) * gH;
        ctx.fillStyle = t.col;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Scorecard 4 Badges
      const cardY0 = p3Y + 148;
      const cardH = 26;
      const cardW = p3W - 20;

      // Badge 1: Contrast Gain
      ctx.fillStyle = '#0b1e33';
      drawRoundRect(ctx, p3X + 10, cardY0, cardW, cardH, 4);
      ctx.fill();
      ctx.font = '600 9px Segoe UI, Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('CONTRAST GAIN (SLOPE):', p3X + 16, cardY0 + 17);
      ctx.font = '700 10.5px Segoe UI, Arial';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'right';
      ctx.fillText(`${contrastGain.toFixed(2)} gray/HU`, p3X + 10 + cardW - 8, cardY0 + 17);

      // Badge 2: Subtle Lesion CNR
      ctx.fillStyle = '#0b1e33';
      drawRoundRect(ctx, p3X + 10, cardY0 + 31, cardW, cardH, 4);
      ctx.fill();
      ctx.font = '600 9px Segoe UI, Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText('SUBTLE LESION CNR:', p3X + 16, cardY0 + 48);
      ctx.font = '700 10.5px Segoe UI, Arial';
      ctx.fillStyle = lesionCNR >= 4.5 ? '#4ade80' : lesionCNR >= 2.5 ? '#facc15' : '#f87171';
      ctx.textAlign = 'right';
      ctx.fillText(`${lesionCNR.toFixed(2)} (${lesionCNR >= 4.5 ? 'Rose MET' : lesionCNR >= 2.5 ? 'Marginal' : 'Buried in Noise'})`, p3X + 10 + cardW - 8, cardY0 + 48);

      // Badge 3: Bone Trabeculae Status
      ctx.fillStyle = '#0b1e33';
      drawRoundRect(ctx, p3X + 10, cardY0 + 62, cardW, cardH, 4);
      ctx.fill();
      ctx.font = '600 9px Segoe UI, Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText('CORTICAL/MARROW DETAIL:', p3X + 16, cardY0 + 79);
      ctx.font = '700 10px Segoe UI, Arial';
      const boneResolvable = low < 700 && high > 450;
      ctx.fillStyle = boneResolvable ? '#4ade80' : '#f87171';
      ctx.textAlign = 'right';
      ctx.fillText(boneResolvable ? 'Resolvable' : high <= 450 ? 'Clipped Black' : 'Saturated White', p3X + 10 + cardW - 8, cardY0 + 79);

      // Badge 4: Deviation Index & Dose Alert
      ctx.fillStyle = '#0b1e33';
      drawRoundRect(ctx, p3X + 10, cardY0 + 93, cardW, cardH, 4);
      ctx.fill();
      ctx.font = '600 9px Segoe UI, Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText('EXPOSURE INDICATOR (DI):', p3X + 16, cardY0 + 110);
      ctx.font = '700 10.5px Segoe UI, Arial';
      ctx.fillStyle = Math.abs(di) <= 1.0 ? '#4ade80' : di > 1.0 ? '#fbbf24' : '#f87171';
      ctx.textAlign = 'right';
      ctx.fillText(`${di >= 0 ? '+' : ''}${di.toFixed(2)} DI (${Math.abs(di) <= 1 ? 'Target' : di > 1 ? 'Creep' : 'Noise'})`, p3X + 10 + cardW - 8, cardY0 + 110);

      // ==========================================
      // BOTTOM FULL-WIDTH STATUS BAR
      // ==========================================
      const statY = 345;
      ctx.fillStyle = '#071626';
      drawRoundRect(ctx, 20, statY, w - 40, 28, 5);
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 9.5px Segoe UI, Arial';
      ctx.fillText(`Passband: [${Math.round(low)} to ${Math.round(high)} HU] | LUT Slope: ${contrastGain.toFixed(2)} gray/HU | Noise: σ=${effNoise.toFixed(1)} SD`, 32, statY + 18);

      ctx.textAlign = 'right';
      ctx.font = '700 9.5px Segoe UI, Arial';
      if (di > 1.0) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`⚠️ Exposure Index: ${ei} (+${di.toFixed(2)} DI) — Dose creep hidden by auto-rescaling`, w - 32, statY + 18);
      } else if (di < -1.0) {
        ctx.fillStyle = '#f87171';
        ctx.fillText(`⚠️ Exposure Index: ${ei} (${di.toFixed(2)} DI) — Quantum mottle dominant (Photon starved)`, w - 32, statY + 18);
      } else {
        ctx.fillStyle = '#4ade80';
        ctx.fillText(`✅ Exposure Index: ${ei} (${di >= 0 ? '+' : ''}${di.toFixed(2)} DI) — Target ALARA Exposure`, w - 32, statY + 18);
      }
      ctx.textAlign = 'left';
    } else if (type === 'image-record') {
      const score = result.score;
      const sid = Number(v.sid || 100);
      const kvp = Number(v.kvp || 70);
      const mas = Number(v.mas || 8);
      const focal = Number(v.focal || 0); // 0 = Small 0.6mm, 1 = Large 1.2mm
      const grid = Number(v.grid || 0);   // 0 = Tabletop Non-Grid, 1 = Table Bucky 8:1 Grid
      const idCheck = Number(v.idCheck !== undefined ? v.idCheck : 1);
      const rotation = Number(v.rotation !== undefined ? v.rotation : 0);
      const artifact = Number(v.artifact !== undefined ? v.artifact : 0);
      const motion = Number(v.motion !== undefined ? v.motion : 0);
      const centering = Number(v.centering !== undefined ? v.centering : 0);
      let colMode = Number(v.collimation !== undefined ? v.collimation : 1);
      if (colMode > 3) colMode = colMode >= 70 ? 1 : 3;
      const marker = Number(v.marker !== undefined ? v.marker : 0);

      // Extract metrics
      const stageIMetric = result.metrics[0];
      const stageMMetric = result.metrics[1];
      const stageAMetric = result.metrics[2];
      const stageGMetric = result.metrics[3];
      const weakestMetric = result.metrics[6];

      // Master background
      ctx.fillStyle = '#061320';
      ctx.fillRect(0, 0, w, h);

      // Top Status Banner
      ctx.fillStyle = '#0b233a';
      ctx.fillRect(0, 0, w, 40);
      ctx.strokeStyle = '#1e3e5c';
      ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(w, 40); ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 13.5px Segoe UI, -apple-system, Arial, sans-serif';
      ctx.fillText('RAD 321 · VIRTUAL AP KNEE CONSOLE', 16, 25);

      ctx.font = '800 12.5px Segoe UI, -apple-system, Arial, sans-serif';
      ctx.fillStyle = idCheck === 1 ? '#4ade80' : '#f87171';
      ctx.fillText(`ID: ${idCheck === 1 ? '✅ Verified (2 IDs)' : '❌ UNVERIFIED'}`, 290, 25);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 12px Segoe UI, -apple-system, Arial, sans-serif';
      ctx.fillText(`SID: ${sid}cm | ${kvp}kVp, ${mas}mAs | FSS: ${focal === 0 ? 'Small 0.6mm' : 'Large 1.2mm'} | ${grid === 0 ? 'Tabletop Non-Grid' : '8:1 Bucky Grid'}`, 445, 25);

      // Panel Layout (height adapted to 362px)
      const p1X = 14, p1Y = 48, p1W = 310, p1H = 362;
      const p2X = 336, p2Y = 48, p2W = 345, p2H = 362;
      const p3X = 693, p3Y = 48, p3W = 293, p3H = 362;

      // ==========================================
      // PANEL 1: POSITIONING & LIGHT FIELD CONSOLE
      // ==========================================
      ctx.fillStyle = '#091c2e';
      drawRoundRect(ctx, p1X, p1Y, p1W, p1H, 10);
      ctx.fill();
      ctx.strokeStyle = '#1e3e5c'; ctx.lineWidth = 1.5; ctx.stroke();

      // Panel 1 Header
      ctx.fillStyle = '#0f2b48';
      drawRoundRect(ctx, p1X + 2, p1Y + 2, p1W - 4, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 13px Segoe UI, Arial, sans-serif';
      ctx.fillText('1. Positioning & Light Field Console', p1X + 12, p1Y + 20);

      // Radiography Table Surface
      const tX = p1X + 14, tY = p1Y + 36, tW = p1W - 28, tH = p1H - 46;
      ctx.fillStyle = '#0d2235';
      drawRoundRect(ctx, tX, tY, tW, tH, 8);
      ctx.fill();
      ctx.strokeStyle = '#1d486e'; ctx.stroke();

      // Receptor & Grid Visual on Table
      if (grid === 0) {
        // Tabletop DR flat panel cassette on table surface
        ctx.fillStyle = '#082f49';
        drawRoundRect(ctx, tX + 10, tY + 28, tW - 20, tH - 40, 6);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 11px Segoe UI, Arial';
        ctx.fillText('DR TABLETOP (NON-GRID)', tX + 16, tY + 44);
      } else {
        // Table Bucky 8:1 Grid Tray beneath table
        ctx.fillStyle = '#0f172a';
        drawRoundRect(ctx, tX + 8, tY + 28, tW - 16, tH - 40, 6);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.stroke();
        // Grid lead strips texture
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)'; ctx.lineWidth = 1.2;
        for (let gx = tX + 14; gx < tX + tW - 14; gx += 7) {
          ctx.beginPath(); ctx.moveTo(gx, tY + 30); ctx.lineTo(gx, tY + tH - 14); ctx.stroke();
        }
        ctx.fillStyle = '#fbbf24';
        ctx.font = '800 11px Segoe UI, Arial';
        ctx.fillText('TABLE BUCKY (8:1 GRID)', tX + 16, tY + 44);
      }

      // Tube info bar at top of Panel 1
      ctx.fillStyle = '#0b233a';
      drawRoundRect(ctx, tX + 6, tY + 4, tW - 12, 22, 4); ctx.fill();
      ctx.fillStyle = '#38bdf8'; ctx.font = '800 11px Segoe UI, Arial';
      ctx.fillText(`TUBE: ${focal === 0 ? 'Small 0.6mm FSS' : 'Large 1.2mm FSS'} | CR: ${centering === 0 ? 'Center' : (centering > 0 ? `+${centering}cm` : `${centering}cm`)}`, tX + 12, tY + 19);

      // Patient Leg Silhouette Center
      const legCenterX = tX + tW / 2;
      const legCenterY = tY + tH / 2 + 10;

      // Draw Patient Leg Contour
      ctx.save();
      const rotAngle = rotation === 1 ? 0.24 : (rotation === -1 ? -0.24 : 0);
      ctx.translate(legCenterX, legCenterY);
      ctx.rotate(rotAngle * 0.45);

      // Leg shadow & contour
      ctx.fillStyle = '#1e3e5c';
      ctx.beginPath();
      ctx.moveTo(-34, -tH / 2 + 30);
      ctx.lineTo(34, -tH / 2 + 30);
      ctx.bezierCurveTo(44, -35, 46, -10, 44, 0);
      ctx.bezierCurveTo(42, 15, 36, 40, 32, tH / 2 - 20);
      ctx.lineTo(-32, tH / 2 - 20);
      ctx.bezierCurveTo(-36, 40, -42, 15, -44, 0);
      ctx.bezierCurveTo(-46, -10, -44, -35, -34, -tH / 2 + 30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Patella indicator
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      const patOffset = rotation === 1 ? 10 : (rotation === -1 ? -10 : 0);
      ctx.ellipse(patOffset, -20, 13, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Joint line indicator
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(-38, 0); ctx.lineTo(38, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      // Foreign Object Artifact (Metal Zipper / Knee Brace)
      if (artifact === 1) {
        // Bright metallic zipper chain and teeth
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.2;
        ctx.fillRect(-20, -74, 40, 46);
        ctx.strokeRect(-20, -74, 40, 46);
        // Interlocking teeth
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        for (let zy = -70; zy <= -32; zy += 6) {
          ctx.beginPath(); ctx.moveTo(-16, zy); ctx.lineTo(16, zy); ctx.stroke();
        }
        // Zipper pull tab
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-5, -30, 10, 15);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px Segoe UI, Arial';
        ctx.fillText('ZIP', -10, -50);
      }

      // Patient ID wristband on leg
      ctx.fillStyle = idCheck === 1 ? '#15803d' : '#b91c1c';
      ctx.fillRect(-34, -tH / 2 + 32, 68, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 10.5px Segoe UI, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(idCheck === 1 ? '✅ ID: J. DOE' : '❌ UNVERIFIED', 0, -tH / 2 + 44);
      ctx.textAlign = 'left';

      ctx.restore();

      // Foreign Object Artifact Warning Badge
      if (artifact === 1) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
        drawRoundRect(ctx, legCenterX - 65, legCenterY - 100, 130, 22, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11.5px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ METAL ARTIFACT', legCenterX, legCenterY - 85);
        ctx.textAlign = 'left';
      }

      // Immobilization Sandbag vs Tremor Waves
      if (motion === 0) {
        // Stable Sandbag Support
        ctx.fillStyle = '#0284c7';
        drawRoundRect(ctx, legCenterX - 68, tY + tH - 28, 136, 22, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✅ Sandbag Immobilized', legCenterX, tY + tH - 13);
        ctx.textAlign = 'left';
      } else {
        // Red Tremor Motion Vibration Waves
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8;
        for (let vi = -1; vi <= 1; vi += 2) {
          ctx.beginPath(); ctx.arc(legCenterX + vi * 48, legCenterY, 20, -Math.PI / 2, Math.PI / 2, vi < 0); ctx.stroke();
          ctx.beginPath(); ctx.arc(legCenterX + vi * 58, legCenterY, 32, -Math.PI / 2, Math.PI / 2, vi < 0); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
        drawRoundRect(ctx, legCenterX - 78, tY + tH - 28, 156, 22, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11.5px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ UNASSISTED TREMOR', legCenterX, tY + tH - 13);
        ctx.textAlign = 'left';
      }

      // Collimator Light Field Simulation
      const colSizes = [
        { w: 90, h: 105, label: '10×12 cm (Clipped)' },
        { w: 145, h: 190, label: '18×24 cm (Optimal)' },
        { w: 195, h: 230, label: '24×30 cm (Moderate)' },
        { w: 245, h: 260, label: '35×43 cm (Wide Open)' }
      ];
      const curCol = colSizes[colMode] || colSizes[1];
      const crY = legCenterY + centering * 12;

      // Illuminated field
      ctx.fillStyle = 'rgba(251, 191, 36, 0.24)';
      ctx.fillRect(legCenterX - curCol.w / 2, crY - curCol.h / 2, curCol.w, curCol.h);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(legCenterX - curCol.w / 2, crY - curCol.h / 2, curCol.w, curCol.h);

      // Collimator crosshair shadow
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(legCenterX, crY - curCol.h / 2);
      ctx.lineTo(legCenterX, crY + curCol.h / 2);
      ctx.moveTo(legCenterX - curCol.w / 2, crY);
      ctx.lineTo(legCenterX + curCol.w / 2, crY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Central Ray Red Target Dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(legCenterX, crY, 4, 0, Math.PI * 2); ctx.fill();

      // Lead Anatomical Side Marker ('R')
      if (marker === 0) {
        const mX = legCenterX + curCol.w / 2 - 26;
        const mY = crY - 32;
        ctx.fillStyle = '#fbbf24';
        drawRoundRect(ctx, mX, mY, 22, 26, 4); ctx.fill();
        ctx.fillStyle = '#0f172a'; ctx.font = '900 17px Segoe UI, Arial';
        ctx.textAlign = 'center'; ctx.fillText('R', mX + 11, mY + 19); ctx.textAlign = 'left';
      } else if (marker === 1) {
        const mX = legCenterX - 11;
        const mY = crY - 13;
        ctx.fillStyle = '#ef4444';
        drawRoundRect(ctx, mX, mY, 22, 26, 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '900 17px Segoe UI, Arial';
        ctx.textAlign = 'center'; ctx.fillText('R', mX + 11, mY + 19); ctx.textAlign = 'left';
        ctx.fillStyle = '#fca5a5'; ctx.font = '800 10.5px Segoe UI, Arial';
        ctx.fillText('ON VOI', mX - 2, mY + 38);
      } else {
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.8; ctx.setLineDash([3, 2]);
        ctx.strokeRect(legCenterX + 45, crY - 30, 24, 26);
        ctx.setLineDash([]);
        ctx.fillStyle = '#f87171'; ctx.font = '900 11px Segoe UI, Arial';
        ctx.fillText('NO MARKER', legCenterX + 16, crY - 36);
      }

      // ==========================================
      // PANEL 2: LATENT X-RAY RADIOGRAPH PREVIEW
      // ==========================================
      ctx.fillStyle = '#040911';
      drawRoundRect(ctx, p2X, p2Y, p2W, p2H, 10);
      ctx.fill();
      ctx.strokeStyle = '#1e3e5c'; ctx.lineWidth = 1.5; ctx.stroke();

      // Panel 2 Header
      ctx.fillStyle = '#0f2b48';
      drawRoundRect(ctx, p2X + 2, p2Y + 2, p2W - 4, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 13px Segoe UI, Arial, sans-serif';
      ctx.fillText('2. Latent X-Ray Radiograph Preview', p2X + 12, p2Y + 20);

      // Radiograph viewport
      const radX = p2X + 14, radY = p2Y + 36, radW = p2W - 28, radH = p2H - 72;
      ctx.save();
      ctx.beginPath();
      drawRoundRect(ctx, radX, radY, radW, radH, 6);
      ctx.clip();

      // Background exposure darkness
      const gridTrans = grid === 1 ? 0.285 : 1.0;
      const ei = Math.round(200 * ((mas * Math.pow(kvp / 70, 2.2) * Math.pow(100 / sid, 2) * gridTrans) / 8));
      const diNum = 10 * Math.log10(Math.max(1, ei) / 200);
      const di = (diNum >= 0 ? '+' : '') + round(diNum, 1);
      const bgDarkness = clamp(Math.round(18 + Math.min(60, (ei / 200) * 35)), 10, 85);
      ctx.fillStyle = `rgb(${bgDarkness}, ${bgDarkness + 2}, ${bgDarkness + 6})`;
      ctx.fillRect(radX, radY, radW, radH);

      // Collimator shutter mask (outer border)
      const colRadW = curCol.w * 1.1;
      const colRadH = curCol.h * 1.1;
      const radCenterX = radX + radW / 2;
      const radCenterY = radY + radH / 2 + centering * 12;

      // Active X-ray exposure region
      ctx.fillStyle = `rgb(${bgDarkness + 8}, ${bgDarkness + 10}, ${bgDarkness + 14})`;
      ctx.fillRect(radCenterX - colRadW / 2, radCenterY - colRadH / 2, colRadW, colRadH);

      // Anatomical Structures (Femur, Tibia, Fibula, Patella)
      const boneCenterX = radX + radW / 2;
      const boneCenterY = radY + radH / 2;

      // Bone opacity based on kVp penetration
      const boneAlpha = clamp(0.75 + (kvp - 70) * 0.005, 0.6, 0.95);

      // Function to render bone anatomy at specific X offset
      function renderBones(offsetX, alphaMul, penumbraBlur) {
        ctx.save();
        ctx.globalAlpha = alphaMul;
        ctx.translate(offsetX, 0);

        // Soft tissue envelope
        ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.beginPath();
        ctx.moveTo(boneCenterX - 48, radY);
        ctx.lineTo(boneCenterX + 48, radY);
        ctx.lineTo(boneCenterX + 52, boneCenterY);
        ctx.lineTo(boneCenterX + 46, radY + radH);
        ctx.lineTo(boneCenterX - 46, radY + radH);
        ctx.lineTo(boneCenterX - 52, boneCenterY);
        ctx.closePath();
        ctx.fill();

        // --- FEMUR (Distal) ---
        ctx.fillStyle = `rgba(226, 232, 240, ${boneAlpha})`;
        ctx.strokeStyle = penumbraBlur ? 'rgba(255, 255, 255, 0.5)' : '#ffffff';
        ctx.lineWidth = penumbraBlur ? 3.0 : 1.8;

        ctx.beginPath();
        ctx.moveTo(-26, radY);
        ctx.lineTo(26, radY);
        ctx.lineTo(28, boneCenterY - 60);
        ctx.bezierCurveTo(34, boneCenterY - 40, 44, boneCenterY - 20, 38, boneCenterY - 6);
        ctx.bezierCurveTo(28, boneCenterY - 2, 16, boneCenterY - 4, 10, boneCenterY - 14);
        ctx.bezierCurveTo(4, boneCenterY - 24, -4, boneCenterY - 24, -10, boneCenterY - 14);
        ctx.bezierCurveTo(-16, boneCenterY - 4, -28, boneCenterY - 2, -38, boneCenterY - 6);
        ctx.bezierCurveTo(-44, boneCenterY - 20, -34, boneCenterY - 40, -28, boneCenterY - 60);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Patella
        ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.beginPath();
        const patRadOffset = rotation === 1 ? 9 : (rotation === -1 ? -9 : 0);
        ctx.ellipse(boneCenterX + patRadOffset, boneCenterY - 32, 15, 19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = penumbraBlur ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // --- TIBIA (Proximal Plateau & Shaft) ---
        ctx.fillStyle = `rgba(226, 232, 240, ${boneAlpha})`;
        ctx.strokeStyle = penumbraBlur ? 'rgba(255, 255, 255, 0.5)' : '#ffffff';
        ctx.lineWidth = penumbraBlur ? 3.0 : 1.8;

        ctx.beginPath();
        ctx.moveTo(boneCenterX - 38, boneCenterY + 4);
        ctx.lineTo(boneCenterX - 9, boneCenterY + 4);
        ctx.lineTo(boneCenterX - 3, boneCenterY - 4);
        ctx.lineTo(boneCenterX, boneCenterY + 1);
        ctx.lineTo(boneCenterX + 3, boneCenterY - 4);
        ctx.lineTo(boneCenterX + 9, boneCenterY + 4);
        ctx.lineTo(boneCenterX + 38, boneCenterY + 4);
        ctx.bezierCurveTo(boneCenterX + 39, boneCenterY + 20, boneCenterX + 30, boneCenterY + 50, boneCenterX + 26, radY + radH);
        ctx.lineTo(boneCenterX - 26, radY + radH);
        ctx.bezierCurveTo(boneCenterX - 30, boneCenterY + 50, boneCenterX - 39, boneCenterY + 20, boneCenterX - 38, boneCenterY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // --- PROXIMAL FIBULA (Rotation dependent) ---
        let fibX = boneCenterX + 36;
        if (rotation === 1) fibX = boneCenterX + 26; // External: fully superimposed
        else if (rotation === -1) fibX = boneCenterX + 48; // Internal: fully separated

        ctx.fillStyle = `rgba(203, 213, 225, ${boneAlpha * 0.9})`;
        ctx.beginPath();
        ctx.moveTo(fibX + 4, boneCenterY + 5);
        ctx.bezierCurveTo(fibX + 12, boneCenterY + 12, fibX + 11, boneCenterY + 26, fibX + 4, boneCenterY + 34);
        ctx.lineTo(fibX + 3, radY + radH);
        ctx.lineTo(fibX - 4, radY + radH);
        ctx.lineTo(fibX - 4, boneCenterY + 34);
        ctx.bezierCurveTo(fibX - 9, boneCenterY + 26, fibX - 7, boneCenterY + 12, fibX - 1, boneCenterY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = penumbraBlur ? 'rgba(255, 255, 255, 0.4)' : '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Trabecular bone network
        if (focal === 0 && !penumbraBlur) {
          // Sharp fine trabecular pattern (Small 0.6mm FSS)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
          ctx.lineWidth = 0.8;
          for (let ty = -18; ty <= 18; ty += 5) {
            ctx.beginPath();
            ctx.moveTo(boneCenterX - 30, boneCenterY - 14 + ty);
            ctx.lineTo(boneCenterX - 10, boneCenterY - 10 + ty);
            ctx.moveTo(boneCenterX + 10, boneCenterY - 10 + ty);
            ctx.lineTo(boneCenterX + 30, boneCenterY - 14 + ty);
            ctx.stroke();
          }
        } else {
          // Softened, diffused trabeculae (Large 1.2mm FSS penumbra)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = 1.8;
          for (let ty = -18; ty <= 18; ty += 8) {
            ctx.beginPath();
            ctx.moveTo(boneCenterX - 28, boneCenterY - 14 + ty);
            ctx.lineTo(boneCenterX - 12, boneCenterY - 10 + ty);
            ctx.moveTo(boneCenterX + 12, boneCenterY - 10 + ty);
            ctx.lineTo(boneCenterX + 28, boneCenterY - 14 + ty);
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // Execute bone rendering with Focal Spot and Motion effects
      const hasPenumbra = focal === 1;
      if (motion === 1) {
        // Dramatic Multi-pass Directional Motion Blur
        renderBones(-4, 0.35, true);
        renderBones(4, 0.35, true);
        renderBones(0, 0.50, hasPenumbra);
      } else {
        // Stationary rendering
        if (hasPenumbra) {
          renderBones(-0.8, 0.3, true);
          renderBones(0.8, 0.3, true);
        }
        renderBones(0, 1.0, hasPenumbra);
      }

      // Radiopaque Artifact Shadow (Metal Zipper)
      if (artifact === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.fillRect(boneCenterX - 20, boneCenterY - 74, 40, 46);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(boneCenterX - 20, boneCenterY - 74, 40, 46);
        for (let zy = -70; zy <= -32; zy += 6) {
          ctx.beginPath(); ctx.moveTo(boneCenterX - 16, boneCenterY + zy); ctx.lineTo(boneCenterX + 16, boneCenterY + zy); ctx.stroke();
        }
        // Label on image
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        drawRoundRect(ctx, boneCenterX - 85, boneCenterY - 104, 170, 24, 4);
        ctx.fill();
        ctx.fillStyle = '#f87171';
        ctx.font = '900 11.5px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ ARTIFACT OVER FEMUR', boneCenterX, boneCenterY - 88);
        ctx.textAlign = 'left';
      }

      // Lead Anatomical Side Marker Shadow
      if (marker === 0) {
        const mX = Math.min(radX + radW - 34, radCenterX + colRadW / 2 - 28);
        const mY = Math.max(radY + 28, radCenterY - 30);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.95)';
        ctx.shadowBlur = 6;
        ctx.font = '900 22px Segoe UI, Arial';
        ctx.fillText('R', mX, mY);
        ctx.shadowBlur = 0;
      } else if (marker === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
        ctx.font = '900 22px Segoe UI, Arial';
        ctx.fillText('R', boneCenterX - 8, boneCenterY + 6);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#f87171';
        ctx.font = '900 11.5px Segoe UI, Arial';
        ctx.fillText('❌ NO LEAD MARKER', radX + 10, radY + radH - 14);
      }

      // DICOM Patient Info Banner on Radiograph
      ctx.fillStyle = 'rgba(10, 25, 41, 0.88)';
      drawRoundRect(ctx, radX + 6, radY + 6, radW - 12, 20, 4);
      ctx.fill();
      ctx.fillStyle = idCheck === 1 ? '#4ade80' : '#f87171';
      ctx.font = '900 10.5px monospace, Segoe UI';
      ctx.fillText(idCheck === 1 ? 'ID: VERIFIED · DOE, J. (DOB 1980-05-12)' : '*** CRITICAL: UNVERIFIED PATIENT ID ***', radX + 12, radY + 20);

      // Quantum Mottle Noise Overlay
      if (ei < 150) {
        const noiseDots = Math.round((150 - ei) * 7);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        for (let nd = 0; nd < noiseDots; nd++) {
          const rx = radX + Math.random() * radW;
          const ry = radY + Math.random() * radH;
          ctx.fillRect(rx, ry, 1.3, 1.3);
        }
      }

      // Wide-Open Scatter Fog (if collimation === 3 and non-grid)
      if (colMode === 3 && grid === 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
        ctx.fillRect(radX, radY, radW, radH);
      }

      // Collimator Lead Frame Mask
      ctx.fillStyle = 'rgba(2, 6, 12, 0.94)';
      if (radCenterY - colRadH / 2 > radY) {
        ctx.fillRect(radX, radY, radW, Math.max(0, (radCenterY - colRadH / 2) - radY));
      }
      if (radCenterY + colRadH / 2 < radY + radH) {
        ctx.fillRect(radX, radCenterY + colRadH / 2, radW, (radY + radH) - (radCenterY + colRadH / 2));
      }
      if (radCenterX - colRadW / 2 > radX) {
        ctx.fillRect(radX, radY, Math.max(0, (radCenterX - colRadW / 2) - radX), radH);
      }
      if (radCenterX + colRadW / 2 < radX + radW) {
        ctx.fillRect(radCenterX + colRadW / 2, radY, (radX + radW) - (radCenterX + colRadW / 2), radH);
      }

      ctx.restore(); // Restore clipping

      // Radiograph Preview Bottom Bar
      ctx.fillStyle = '#0b233a';
      drawRoundRect(ctx, radX, radY + radH + 6, radW, 26, 4);
      ctx.fill();
      ctx.strokeStyle = '#1d486e'; ctx.stroke();

      ctx.fillStyle = '#cbd5e1'; ctx.font = '800 11.5px Segoe UI, Arial';
      const jointStatus = Math.abs(centering) <= 1 && rotation === 0 ? '✅ Joint: Open (Optimal)' : '⚠️ Joint: Overlapped/Angled';
      ctx.fillText(jointStatus, radX + 10, radY + radH + 23);
      ctx.textAlign = 'right';
      ctx.fillStyle = diNum > 1.0 ? '#fbbf24' : diNum < -1.0 ? '#f87171' : '#4ade80';
      ctx.fillText(`EI: ${ei} (${di} DI)`, radX + radW - 10, radY + radH + 23);
      ctx.textAlign = 'left';

      // ==========================================
      // PANEL 3: IMAGE STAGE RADAR & READINESS
      // ==========================================
      ctx.fillStyle = '#091c2e';
      drawRoundRect(ctx, p3X, p3Y, p3W, p3H, 10);
      ctx.fill();
      ctx.strokeStyle = '#1e3e5c'; ctx.lineWidth = 1.5; ctx.stroke();

      // Panel 3 Header
      ctx.fillStyle = '#0f2b48';
      drawRoundRect(ctx, p3X + 2, p3Y + 2, p3W - 4, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '900 13px Segoe UI, Arial, sans-serif';
      ctx.fillText('3. IMAGE Stage Readiness', p3X + 12, p3Y + 20);

      // 4 Stage Progress Bars
      const stageList = [
        { key: 'I', name: 'Initial Setup & ID', score: Number(stageIMetric.value) },
        { key: 'M', name: 'Manual Factors (EI/DI)', score: Math.round(clamp(100 - Math.abs(diNum) * 22, 0, 100)) },
        { key: 'A', name: 'Anatomy & Prep', score: Number(stageAMetric.value) },
        { key: 'G', name: 'Beam Guidance', score: Number(stageGMetric.value) }
      ];

      const barStartX = p3X + 16;
      const barW = p3W - 32;

      stageList.forEach((st, idx) => {
        const barY = p3Y + 36 + idx * 37;
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '800 12px Segoe UI, Arial';
        ctx.fillText(`[${st.key}] ${st.name}`, barStartX, barY + 11);
        ctx.textAlign = 'right';
        ctx.fillStyle = st.score >= 80 ? '#4ade80' : (st.score >= 50 ? '#fbbf24' : '#f87171');
        ctx.font = '900 12.5px Segoe UI, Arial';
        ctx.fillText(`${st.score}%`, barStartX + barW, barY + 11);
        ctx.textAlign = 'left';

        // Track
        ctx.fillStyle = '#0f273d';
        drawRoundRect(ctx, barStartX, barY + 17, barW, 9, 4.5);
        ctx.fill();
        // Fill
        const fillW = Math.max(6, (st.score / 100) * barW);
        ctx.fillStyle = st.score >= 80 ? '#10b981' : (st.score >= 50 ? '#f59e0b' : '#ef4444');
        drawRoundRect(ctx, barStartX, barY + 17, fillW, 9, 4.5);
        ctx.fill();
      });

      // Big Readiness Score Circle & Badge
      const dialY = p3Y + 196;
      const scoreColor = score >= 85 ? '#10b981' : (score >= 65 ? '#f59e0b' : '#ef4444');
      const scoreTag = score >= 85 ? 'EXPOSURE READY' : (score >= 65 ? 'SUBOPTIMAL' : 'CRITICAL DEFECT');

      // Dial Box
      ctx.fillStyle = '#0f273d';
      drawRoundRect(ctx, p3X + 16, dialY, p3W - 32, 60, 8);
      ctx.fill();
      ctx.strokeStyle = scoreColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Big Score Number
      ctx.fillStyle = scoreColor;
      ctx.font = '900 28px Segoe UI, Arial';
      ctx.fillText(`${round(score, 0)}%`, p3X + 26, dialY + 41);

      // Score Label & Disposition
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 12.5px Segoe UI, Arial';
      ctx.fillText('Recording Readiness', p3X + 102, dialY + 26);
      ctx.fillStyle = scoreColor;
      ctx.font = '900 11.5px Segoe UI, Arial';
      ctx.fillText(scoreTag, p3X + 102, dialY + 46);

      // Clinical Action Summary Box
      ctx.fillStyle = '#0b233a';
      drawRoundRect(ctx, p3X + 16, dialY + 68, p3W - 32, 54, 6);
      ctx.fill();
      ctx.strokeStyle = '#1d486e';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 11px Segoe UI, Arial';
      if (score >= 85) {
        ctx.fillText('All 4 IMAGE recording stages meet diagnostic', p3X + 22, dialY + 88);
        ctx.fillText('criteria. Proceed to trigger exposure safely.', p3X + 22, dialY + 106);
      } else if (result.observation.startsWith('CRITICAL') || result.observation.startsWith('SUBOPTIMAL')) {
        ctx.fillStyle = result.observation.startsWith('CRITICAL') ? '#fca5a5' : '#fde68a';
        ctx.fillText(result.observation.slice(0, 36), p3X + 22, dialY + 88);
        ctx.fillText(result.observation.slice(36, 76), p3X + 22, dialY + 106);
      } else {
        ctx.fillText(`Review ${weakestMetric.value} (${weakestMetric.meaning})`, p3X + 22, dialY + 88);
        ctx.fillText('and correct settings before patient exposure.', p3X + 22, dialY + 106);
      }

    } else if (type === 'image-eval') {
      const raw = result.raw || {
        anatScore: v.anatomy || 85,
        posScore: 85,
        expScore: 80,
        markScore: 90,
        artScore: 100,
        ei: Math.round((v.mas || 8) * 25),
        di: '+0.0',
        noiseSD: '9.9',
        rotation: v.rotation || 0,
        mas: v.mas || 8,
        marker: v.marker || 0,
        artifact: v.artifact || 0,
        isRepeatJustified: false,
        criticalFail: false,
        disposition: 'ACCEPT & TRANSMIT TO PACS',
        decision: 'Optimal diagnostic quality',
        correctiveAction: 'Image meets all diagnostic criteria.'
      };

      const ww = v.ww !== undefined ? Number(v.ww) : 400;
      const wl = v.wl !== undefined ? Number(v.wl) : 200;
      const viewTool = v.viewTool || 'standard';
      const isInverted = viewTool === 'invert';

      // =========================================================================
      // LEFT PANEL: PACS RADIOGRAPH REVIEW MONITOR (x: 12 -> 492, w: 480, h: 476)
      // =========================================================================
      const monX = 12, monY = 12, monW = 480, monH = 476;
      ctx.fillStyle = '#040d16';
      ctx.fillRect(monX, monY, monW, monH);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
      ctx.strokeRect(monX, monY, monW, monH);

      // PACS Monitor Header Bar
      ctx.fillStyle = '#091f33';
      ctx.fillRect(monX, monY, monW, 34);
      ctx.strokeStyle = '#1e4066'; ctx.lineWidth = 1;
      ctx.strokeRect(monX, monY, monW, 34);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('🖥️ PACS WORKSTATION · VIEWPORT 1', monX + 14, monY + 22);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText('12-BIT DICOM · LOSSLESS', monX + monW - 180, monY + 22);

      // Radiograph Viewport Area (w: 468, h: 394)
      const radX = monX + 6, radY = monY + 38, radW = monW - 12, radH = monH - 80;
      ctx.save();
      ctx.beginPath();
      ctx.rect(radX, radY, radW, radH);
      ctx.clip();

      // Windowing contrast multiplier & brightness shift
      const contrastGain = Math.min(2.5, Math.max(0.4, 400 / ww));
      const brightnessShift = ((wl - 200) / 400) * 40;

      // Base unattenuated radiation background
      const baseBgVal = Math.max(5, Math.min(45, Math.round(18 * contrastGain + brightnessShift)));
      ctx.fillStyle = isInverted ? `rgb(${255 - baseBgVal},${255 - baseBgVal},${255 - baseBgVal})` : `rgb(${baseBgVal},${baseBgVal},${baseBgVal})`;
      ctx.fillRect(radX, radY, radW, radH);

      // Collimator light field boundary
      const isClipped = raw.anatScore < 70;
      const colX = isClipped ? radX + 54 : radX + 24;
      const colY = isClipped ? radY + 44 : radY + 18;
      const colW = isClipped ? radW - 108 : radW - 48;
      const colH = isClipped ? radH - 88 : radH - 36;

      // Uncollimated margins (dark lead shutter border)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      ctx.fillRect(radX, radY, radW, colY - radY);
      ctx.fillRect(radX, colY + colH, radW, (radY + radH) - (colY + colH));
      ctx.fillRect(radX, colY, colX - radX, colH);
      ctx.fillRect(colX + colW, colY, (radX + radW) - (colX + colW), colH);

      // Collimation field outline
      ctx.strokeStyle = isClipped ? 'rgba(239, 68, 68, 0.9)' : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(colX, colY, colW, colH);

      // Center of anatomy
      const bX = radX + radW / 2;
      const bY = radY + radH / 2;
      const rot = raw.rotation;

      // Function to render the AP knee bones with rotation and technique effects
      function drawKneeAnatomy(offsetX, alpha, isBlur) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(bX + offsetX, bY);

        // Soft Tissue Outline (skin profile)
        const stVal = Math.round(clamp(45 * contrastGain + brightnessShift, 15, 110));
        ctx.fillStyle = isInverted ? `rgb(${255 - stVal},${255 - stVal},${255 - stVal})` : `rgb(${stVal},${stVal},${stVal})`;
        ctx.beginPath();
        ctx.moveTo(-75, -155);
        ctx.bezierCurveTo(-90, -60, -92, 40, -82, 155);
        ctx.lineTo(82, 155);
        ctx.bezierCurveTo(92, 40, 90, -60, 75, -155);
        ctx.closePath();
        ctx.fill();

        // Bone Grayscale tone calculated from technique & windowing
        const boneBase = clamp(190 * contrastGain + brightnessShift, 60, 245);
        const cortexTone = isInverted ? `rgb(${255 - boneBase - 35},${255 - boneBase - 35},${255 - boneBase - 35})` : `rgb(${boneBase + 25},${boneBase + 25},${boneBase + 25})`;
        const medullaryTone = isInverted ? `rgb(${255 - boneBase},${255 - boneBase},${255 - boneBase})` : `rgb(${boneBase - 25},${boneBase - 25},${boneBase - 25})`;

        ctx.fillStyle = medullaryTone;
        ctx.strokeStyle = cortexTone;
        ctx.lineWidth = isBlur ? 3.5 : 2;

        // 1. Distal Femur
        ctx.beginPath();
        ctx.moveTo(-35, -155);
        ctx.lineTo(-33, -70);
        ctx.bezierCurveTo(-50, -52, -60, -30, -48, -12); // Medial condyle
        ctx.bezierCurveTo(-33, 2, -14, 0, 0, -9);        // Intercondylar notch
        ctx.bezierCurveTo(14, 0, 33, 2, 48, -12);        // Lateral condyle
        ctx.bezierCurveTo(60, -30, 50, -52, 33, -70);
        ctx.lineTo(35, -155);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Medial adductor tubercle
        ctx.beginPath();
        ctx.arc(-46, -32, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = cortexTone;
        ctx.fill();
        ctx.fillStyle = medullaryTone;

        // 2. Patella
        const patellaShiftX = rot * 1.5;
        ctx.beginPath();
        ctx.ellipse(patellaShiftX, -32, 18, 23, 0, 0, Math.PI * 2);
        ctx.fillStyle = isInverted ? 'rgba(100,100,100,0.65)' : 'rgba(230,230,230,0.55)';
        ctx.fill();
        ctx.stroke();

        // 3. Femorotibial Joint Space & Tibial Plateaus
        const jtGap = Math.max(2, 7 - Math.abs(rot) * 0.2);
        ctx.beginPath();
        ctx.moveTo(-50, jtGap);
        ctx.bezierCurveTo(-33, jtGap + 1, -14, jtGap + 2, -7, jtGap - 2); // Medial tibial spine
        ctx.lineTo(-2, jtGap - 8);
        ctx.lineTo(2, jtGap - 8);
        ctx.lineTo(7, jtGap - 2); // Lateral tibial spine
        ctx.bezierCurveTo(14, jtGap + 2, 33, jtGap + 1, 50, jtGap);
        ctx.lineTo(40, 45);
        ctx.lineTo(33, 155);
        ctx.lineTo(-33, 155);
        ctx.lineTo(-40, 45);
        ctx.closePath();
        ctx.fillStyle = medullaryTone;
        ctx.fill();
        ctx.stroke();

        // 4. Proximal Fibula
        const fibX = 44 + rot * 1.2;
        ctx.beginPath();
        ctx.moveTo(fibX - 6, 22);
        ctx.bezierCurveTo(fibX + 14, 25, fibX + 16, 42, fibX + 9, 54);
        ctx.lineTo(fibX + 5, 155);
        ctx.lineTo(fibX - 5, 155);
        ctx.lineTo(fibX - 7, 52);
        ctx.closePath();
        ctx.fillStyle = isInverted ? 'rgba(120,120,120,0.85)' : 'rgba(205,205,205,0.75)';
        ctx.fill();
        ctx.stroke();

        // Trabecular bone fine detail lines
        if (!isBlur && raw.mas >= 3) {
          ctx.strokeStyle = isInverted ? 'rgba(40,40,40,0.25)' : 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 0.9;
          for (let ty = -60; ty <= -18; ty += 8) {
            ctx.beginPath();
            ctx.moveTo(-38, ty); ctx.lineTo(-16, ty + 4);
            ctx.moveTo(16, ty + 4); ctx.lineTo(38, ty);
            ctx.stroke();
          }
          for (let ty = 14; ty <= 50; ty += 8) {
            ctx.beginPath();
            ctx.moveTo(-35, ty); ctx.lineTo(-12, ty - 3);
            ctx.moveTo(12, ty - 3); ctx.lineTo(35, ty);
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // Execute anatomy rendering with motion check
      if (raw.artifact === 2) {
        drawKneeAnatomy(-4, 0.4, true);
        drawKneeAnatomy(4, 0.4, true);
        drawKneeAnatomy(0, 0.6, true);
      } else {
        drawKneeAnatomy(0, 1.0, false);
      }

      // Quantum Mottle Noise Simulation
      if (raw.mas < 4) {
        const noiseCount = Math.round((4 - raw.mas) * 1400);
        ctx.fillStyle = isInverted ? 'rgba(0,0,0,0.48)' : 'rgba(255,255,255,0.48)';
        for (let i = 0; i < noiseCount; i++) {
          const nx = colX + Math.random() * colW;
          const ny = colY + Math.random() * colH;
          ctx.fillRect(nx, ny, 1.4, 1.4);
        }
      }

      // Artifact Overlays
      if (raw.artifact === 1) {
        // Metallic zipper artifact over distal femur
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8;
        ctx.fillRect(bX - 20, bY - 95, 40, 56);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
        ctx.strokeRect(bX - 20, bY - 95, 40, 56);
        for (let zy = -88; zy <= -46; zy += 6) {
          ctx.beginPath(); ctx.moveTo(bX - 16, bY + zy); ctx.lineTo(bX + 16, bY + zy); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(bX - 145, bY - 134, 290, 30);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
        ctx.strokeRect(bX - 145, bY - 134, 290, 30);
        ctx.fillStyle = '#fca5a5'; ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('⚠️ ARTIFACT: METAL ZIPPER OVER VOI', bX - 136, bY - 114);
      } else if (raw.artifact === 3) {
        // Detector column defect (vertical dead line)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bX + 26, radY, 3.5, radH);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(bX + 35, radY + 54, 230, 30);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
        ctx.strokeRect(bX + 35, radY + 54, 230, 30);
        ctx.fillStyle = '#fca5a5'; ctx.font = '900 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('⚠️ DETECTOR COLUMN LINE DEFECT', bX + 43, radY + 74);
      }

      if (isClipped) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(radX + 14, radY + radH - 74, 340, 30);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
        ctx.strokeRect(radX + 14, radY + radH - 74, 340, 30);
        ctx.fillStyle = '#fca5a5'; ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('⚠️ CLIPPED: DISTAL FEMUR CUT OFF', radX + 22, radY + radH - 54);
      }

      // Lead Anatomical Side Marker Rendering
      const markX = radX + radW - 55;
      const markY = radY + 52;
      if (raw.marker === 0) {
        // Correct physical lead 'R' marker
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.95)'; ctx.shadowBlur = 8;
        ctx.font = '900 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('R', markX, markY);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(14, 165, 233, 0.3)';
        drawRoundRect(ctx, markX - 22, markY + 8, 68, 20, 4);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#38bdf8'; ctx.font = '900 12.5px ui-monospace, monospace';
        ctx.fillText('LEAD R', markX - 16, markY + 23);
      } else if (raw.marker === 1) {
        // Wrong side 'L' marker on right knee!
        ctx.fillStyle = '#f87171';
        ctx.font = '900 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('L', markX, markY);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        drawRoundRect(ctx, markX - 65, markY + 8, 135, 22, 4);
        ctx.fill();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fca5a5'; ctx.font = '900 12.5px -apple-system, sans-serif';
        ctx.fillText('⚠️ WRONG SIDE (\'L\')', markX - 58, markY + 24);
      } else if (raw.marker === 2) {
        // Digital post-exposure annotation
        ctx.fillStyle = 'rgba(234, 179, 8, 0.2)';
        drawRoundRect(ctx, markX - 22, markY - 34, 52, 52, 6);
        ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.font = '900 24px ui-monospace, monospace';
        ctx.fillText('R', markX - 6, markY);
        ctx.font = '900 11.5px -apple-system, sans-serif';
        ctx.fillText('E-MARKER', markX - 20, markY + 30);
      } else {
        // Missing marker
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        drawRoundRect(ctx, markX - 118, markY - 14, 170, 34, 6);
        ctx.fill();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#f87171'; ctx.font = '900 14px -apple-system, sans-serif';
        ctx.fillText('❌ NO LEAD MARKER', markX - 110, markY + 9);
      }

      // Patient Demographics Overlay (Top Left Pill)
      ctx.fillStyle = 'rgba(4, 16, 28, 0.94)';
      drawRoundRect(ctx, radX + 8, radY + 8, 290, 46, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e4066'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText('PT: AL-HARBI, K. (M/44) | #948201', radX + 16, radY + 26);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '800 12.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText('EXAM: AP KNEE (RT) | 70kVp · ' + raw.mas + 'mAs', radX + 16, radY + 43);

      ctx.restore(); // Restore clipping

      // Radiograph Technical Footer
      const footerY = radY + radH;
      ctx.fillStyle = 'rgba(6, 19, 32, 0.96)';
      ctx.fillRect(radX, footerY, radW, 36);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1.5;
      ctx.strokeRect(radX, footerY, radW, 36);

      ctx.fillStyle = raw.ei < 100 || raw.ei > 400 ? '#f87171' : '#38bdf8';
      ctx.font = '900 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText('EI: ' + raw.ei + ' (' + raw.di + ' DI) | σ=' + raw.noiseSD + '%', radX + 14, footerY + 23);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText('WW: ' + ww + ' · WL: ' + wl + ' | ' + (isInverted ? 'INVERT' : 'STD'), radX + radW - 186, footerY + 23);

      // =========================================================================
      // RIGHT PANEL: SYSTEMATIC CRITIQUE SCORECARD & ALARA VERDICT (x: 504 -> 988)
      // =========================================================================
      const pX = 504, pY = 12, pW = 484, pH = 476;
      ctx.fillStyle = '#061525';
      ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
      ctx.strokeRect(pX, pY, pW, pH);

      // Dashboard Header
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('IMAGE STAGE E: CRITIQUE DASHBOARD', pX + 16, pY + 23);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('5-Domain Clinical Evaluation & ALARA Gating Engine', pX + 16, pY + 41);

      // 5 Evaluation Domains (height: 47px each, gap: 4px)
      const evalCards = [
        { label: '1. Anatomy & Collimation', score: raw.anatScore, weight: '(30%)', pass: raw.anatScore >= 70, detail: raw.anatScore < 70 ? '⚠️ Distal femur cut off by tight collimation' : 'Full anatomy included (4-sided collimation)' },
        { label: '2. Positioning & Alignment', score: raw.posScore, weight: '(25%)', pass: Math.abs(raw.rotation) < 15, detail: Math.abs(raw.rotation) >= 15 ? '⚠️ Excessive rotation (' + (raw.rotation > 0 ? '+' : '') + raw.rotation + '°)' : 'True AP (symmetric epicondyles, ⅓ fibular overlap)' },
        { label: '3. Exposure & Noise Index', score: raw.expScore, weight: '(25%)', pass: raw.mas >= 3 && raw.mas <= 20, detail: raw.mas < 3 ? '⚠️ Severe quantum mottle (EI ' + raw.ei + ', ' + raw.di + ' DI)' : 'EI ' + raw.ei + ' (' + raw.di + ' DI, σ=' + raw.noiseSD + '%)' },
        { label: '4. Lead Marker & ID Gate', score: raw.markScore, weight: '(10%)', pass: raw.marker === 0 || raw.marker === 2, detail: raw.marker === 0 ? 'Verified physical lead R marker in beam' : raw.marker === 1 ? '⚠️ CRITICAL: Wrong side marker (\'L\')' : raw.marker === 2 ? 'Digital annotation used (administrative)' : '⚠️ Missing physical lead side marker' },
        { label: '5. Artifact & Motion Integrity', score: raw.artScore, weight: '(10%)', pass: raw.artifact === 0, detail: raw.artifact === 0 ? 'Clean image (no foreign artifacts or motion)' : raw.artifact === 1 ? '⚠️ Metal zipper over distal femur VOI' : raw.artifact === 2 ? '⚠️ Involuntary patient motion unsharpness' : '⚠️ Detector column line defect' }
      ];

      evalCards.forEach((c, idx) => {
        const cardY = pY + 48 + idx * 51;
        ctx.fillStyle = '#030d17';
        ctx.fillRect(pX + 10, cardY, pW - 20, 47);
        ctx.strokeStyle = c.pass ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pX + 10, cardY, pW - 20, 47);

        // Domain Name & Weight
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(c.label, pX + 16, cardY + 19);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(c.weight, pX + 225, cardY + 19);

        // Detail explanation
        ctx.fillStyle = c.pass ? '#cbd5e1' : '#fca5a5';
        ctx.font = '700 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(c.detail, pX + 16, cardY + 38);

        // Score Badge on right
        const badgeX = pX + pW - 128, badgeY = cardY + 6, badgeW = 118, badgeH = 35;
        ctx.fillStyle = c.pass ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.18)';
        drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
        ctx.fill();
        ctx.strokeStyle = c.pass ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = c.pass ? '#4ade80' : '#f87171';
        ctx.font = '900 13.5px -apple-system, sans-serif';
        ctx.fillText(c.pass ? 'PASS' : 'FAIL', badgeX + 8, badgeY + 22);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(Math.round(c.score) + '%', badgeX + 58, badgeY + 22);
      });

      // =========================================================================
      // CLINICAL ALARA DISPOSITION CARD (Bottom Right, y: 308 to 468)
      // =========================================================================
      const vY = pY + 308, vW = pW - 20, vH = 160;
      const isRepeat = raw.isRepeatJustified;
      const isNoRepeatGate = raw.disposition.includes('Do NOT Repeat');

      ctx.fillStyle = isRepeat ? '#360606' : isNoRepeatGate ? '#361b03' : '#032612';
      drawRoundRect(ctx, pX + 10, vY, vW, vH, 8);
      ctx.fill();
      ctx.strokeStyle = isRepeat ? '#ef4444' : isNoRepeatGate ? '#f59e0b' : '#22c55e';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Disposition Header
      ctx.fillStyle = isRepeat ? '#fca5a5' : isNoRepeatGate ? '#fde68a' : '#86efac';
      ctx.font = '900 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(raw.disposition, pX + 18, vY + 23);

      // Score Pill
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText(`CRITIQUE: ${Math.round(result.score)} / 100`, pX + vW - 142, vY + 23);

      // Primary Finding
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`Finding: ${raw.decision}`, pX + 18, vY + 47);

      // Actionable Corrective Directive (ALARA Guideline)
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 13.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Directive:', pX + 18, vY + 70);

      ctx.fillStyle = isRepeat ? '#fecaca' : isNoRepeatGate ? '#fef08a' : '#bbf7d0';
      ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      // Multi-line wrap for corrective action
      const actionWords = raw.correctiveAction.split(' ');
      let line1 = '', line2 = '';
      actionWords.forEach(word => {
        if ((line1 + ' ' + word).length < 46 && !line2) {
          line1 += (line1 ? ' ' : '') + word;
        } else {
          line2 += (line2 ? ' ' : '') + word;
        }
      });
      ctx.fillText(line1, pX + 90, vY + 70);
      if (line2) ctx.fillText(line2, pX + 18, vY + 90);

      // ALARA Policy Directive Box
      const alaraBoxY = vY + (line2 ? 104 : 88);
      const alaraBoxH = vY + vH - alaraBoxY - 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
      drawRoundRect(ctx, pX + 16, alaraBoxY, vW - 12, alaraBoxH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '800 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('⚖️ ALARA Rule: Re-exposure prohibited if diagnostic value is recoverable.', pX + 24, alaraBoxY + 18);
      if (alaraBoxH > 28) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '700 11.5px -apple-system, sans-serif';
        ctx.fillText('Log all repeat exposures and corrective causes into departmental QA registry.', pX + 24, alaraBoxY + 34);
      }

    } else if (type === 'artifacts') {
      const raw = result.raw || {
        idx: 0,
        art: ARTIFACT_CASES[0],
        severity: 50,
        location: 0,
        prevention: 75,
        voiImpact: 0,
        isRepeatJustified: false,
        disposition: 'ACCEPT & TRANSMIT TO PACS',
        decision: 'Optimal diagnostic quality',
        correctiveAction: 'No correction needed; image meets all diagnostic criteria.',
        residualRisk: 0,
        compositeScore: 98
      };

      const idx = raw.idx;
      const art = raw.art || ARTIFACT_CASES[idx] || ARTIFACT_CASES[0];
      const ww = v.ww !== undefined ? Number(v.ww) : 400;
      const wl = v.wl !== undefined ? Number(v.wl) : 200;
      const viewTool = v.viewTool || 'standard';
      const isInverted = viewTool === 'invert';
      const isOverlay = viewTool === 'overlay';

      // =========================================================================
      // LEFT PANEL: PACS RADIOGRAPH & ARTIFACT VIEWPORT (x: 14 -> 490, w: 476, h: 436)
      // =========================================================================
      const monX = 14, monY = 12, monW = 476, monH = 436;
      ctx.fillStyle = '#061320';
      ctx.fillRect(monX, monY, monW, monH);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
      ctx.strokeRect(monX, monY, monW, monH);

      // PACS Monitor Header Bar
      ctx.fillStyle = '#0a1d2e';
      ctx.fillRect(monX, monY, monW, 28);
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px monospace';
      const pacsRight = art.modality.toUpperCase() + ' · LOSSLESS DICOM';
      ctx.textAlign = 'right';
      ctx.fillText(pacsRight, monX + monW - 12, monY + 19);
      const pacsRightW = ctx.measureText(pacsRight).width;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#38bdf8';
      setFittedFont(ctx, 'RAD321 PACS · VIEWPORT 1', monW - pacsRightW - 48, 12, '800', 'monospace');
      ctx.fillText('RAD321 PACS · VIEWPORT 1', monX + 12, monY + 19);

      // Radiograph Viewport Area
      const radX = monX + 6, radY = monY + 30, radW = monW - 12, radH = monH - 36;
      ctx.save();
      ctx.beginPath();
      ctx.rect(radX, radY, radW, radH);
      ctx.clip();

      // Windowing contrast multiplier & brightness shift
      const contrastGain = Math.min(2.5, Math.max(0.4, 400 / ww));
      const brightnessShift = ((wl - 200) / 400) * 40;

      // Base unattenuated radiation background
      const baseBgVal = Math.max(5, Math.min(45, Math.round(18 * contrastGain + brightnessShift)));
      ctx.fillStyle = isInverted ? `rgb(${255 - baseBgVal},${255 - baseBgVal},${255 - baseBgVal})` : `rgb(${baseBgVal},${baseBgVal},${baseBgVal})`;
      ctx.fillRect(radX, radY, radW, radH);

      // Collimator light field boundary
      const colX = radX + 22;
      const colY = radY + 16;
      const colW = radW - 44;
      const colH = radH - 32;

      // Uncollimated margins (dark lead shutter border)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(radX, radY, radW, colY - radY);
      ctx.fillRect(radX, colY + colH, radW, (radY + radH) - (colY + colH));
      ctx.fillRect(radX, colY, colX - radX, colH);
      ctx.fillRect(colX + colW, colY, (radX + radW) - (colX + colW), colH);

      // Collimation field outline
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(colX, colY, colW, colH);

      // Center of anatomy
      const bX = radX + radW / 2;
      const bY = radY + radH / 2;

      // Function to render the AP knee bones with technique and windowing effects
      function drawAnatomyLayer(offsetX, offsetY, alpha, isBlur) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(bX + offsetX, bY + offsetY);

        // Soft Tissue Outline (skin profile)
        const stVal = Math.round(clamp(45 * contrastGain + brightnessShift, 15, 110));
        ctx.fillStyle = isInverted ? `rgb(${255 - stVal},${255 - stVal},${255 - stVal})` : `rgb(${stVal},${stVal},${stVal})`;
        ctx.beginPath();
        ctx.moveTo(-75, -155);
        ctx.bezierCurveTo(-90, -60, -92, 40, -82, 155);
        ctx.lineTo(82, 155);
        ctx.bezierCurveTo(92, 40, 90, -60, 75, -155);
        ctx.closePath();
        ctx.fill();

        // Bone Grayscale tone calculated from technique & windowing
        const boneBase = clamp(190 * contrastGain + brightnessShift, 60, 245);
        const cortexTone = isInverted ? `rgb(${255 - boneBase - 35},${255 - boneBase - 35},${255 - boneBase - 35})` : `rgb(${boneBase + 25},${boneBase + 25},${boneBase + 25})`;
        const medullaryTone = isInverted ? `rgb(${255 - boneBase},${255 - boneBase},${255 - boneBase})` : `rgb(${boneBase - 25},${boneBase - 25},${boneBase - 25})`;

        ctx.fillStyle = medullaryTone;
        ctx.strokeStyle = cortexTone;
        ctx.lineWidth = isBlur ? 3.5 : 2;

        // 1. Distal Femur
        ctx.beginPath();
        ctx.moveTo(-35, -155);
        ctx.lineTo(-33, -70);
        ctx.bezierCurveTo(-50, -52, -60, -30, -48, -12); // Medial condyle
        ctx.bezierCurveTo(-33, 2, -14, 0, 0, -9);        // Intercondylar notch
        ctx.bezierCurveTo(14, 0, 33, 2, 48, -12);        // Lateral condyle
        ctx.bezierCurveTo(60, -30, 50, -52, 33, -70);
        ctx.lineTo(35, -155);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Medial adductor tubercle
        ctx.beginPath();
        ctx.arc(-46, -32, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = cortexTone;
        ctx.fill();
        ctx.fillStyle = medullaryTone;

        // 2. Patella
        ctx.beginPath();
        ctx.ellipse(0, -46, 21, 26, 0, 0, Math.PI * 2);
        ctx.strokeStyle = cortexTone;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. Proximal Tibia (Tibial plateaus and spines)
        ctx.beginPath();
        ctx.moveTo(-50, 7);   // Medial plateau
        ctx.bezierCurveTo(-33, 6, -14, 5, -6, -4);
        ctx.lineTo(0, 3);
        ctx.lineTo(6, -4);    // Lateral spine
        ctx.bezierCurveTo(14, 5, 33, 6, 50, 7);
        ctx.bezierCurveTo(55, 20, 46, 40, 31, 62);
        ctx.lineTo(31, 155);
        ctx.lineTo(-31, 155);
        ctx.lineTo(-31, 62);
        ctx.bezierCurveTo(-46, 40, -55, 20, -50, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 4. Proximal Fibula (Head & neck with 1/3 superimposition)
        ctx.beginPath();
        ctx.moveTo(38, 16);
        ctx.bezierCurveTo(57, 17, 62, 36, 53, 58);
        ctx.lineTo(48, 85);
        ctx.lineTo(46, 155);
        ctx.lineTo(36, 155);
        ctx.lineTo(38, 85);
        ctx.bezierCurveTo(37, 50, 33, 28, 38, 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. Trabecular Bone Microarchitecture Patterns
        if (!isBlur) {
          ctx.strokeStyle = isInverted ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 0.9;
          for (let ty = -62; ty <= -18; ty += 8) {
            ctx.beginPath();
            ctx.moveTo(-38, ty); ctx.lineTo(-16, ty + 4);
            ctx.moveTo(16, ty + 4); ctx.lineTo(38, ty);
            ctx.stroke();
          }
          for (let ty = 14; ty <= 50; ty += 8) {
            ctx.beginPath();
            ctx.moveTo(-35, ty); ctx.lineTo(-12, ty - 3);
            ctx.moveTo(12, ty - 3); ctx.lineTo(35, ty);
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // Execute Anatomy Rendering (with motion check)
      if (idx === 5) {
        drawAnatomyLayer(-5, -2, 0.35, true);
        drawAnatomyLayer(5, 2, 0.35, true);
        drawAnatomyLayer(-2, 1, 0.45, true);
        drawAnatomyLayer(0, 0, 0.6, true);
      } else {
        drawAnatomyLayer(0, 0, 1.0, false);
      }

      // =========================================================================
      // ARTIFACT SIGNATURE RENDERING (Cases 0 - 9)
      // =========================================================================
      const sev = raw.severity / 100;

      function renderArtifactCallout(text, isDanger) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(radX + 10, radY + 48, radW - 20, 26);
        ctx.strokeStyle = isDanger ? '#ef4444' : '#facc15';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(radX + 10, radY + 48, radW - 20, 26);
        ctx.fillStyle = isDanger ? '#fca5a5' : '#fef08a';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        setFittedFont(ctx, text, radW - 76, 12.5, '900', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        ctx.fillText(text, radX + 18, radY + 65);
      }

      if (idx === 1) {
        // Case 1: DR Column / Dead Pixel Line Defect
        const lineX = bX + 20;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(lineX - 1, radY, 3.5, radH);
        renderArtifactCallout('⚠️ DR DEAD COLUMN LINE DEFECT (TFT READOUT FAILURE)', true);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(lineX + 10, radY + 84, 210, 22);
        ctx.fillStyle = '#f87171'; ctx.font = '800 11px monospace';
        ctx.fillText('COL 512 | HARDWARE FAULT', lineX + 16, radY + 99);

      } else if (idx === 2) {
        // Case 2: Stationary Grid Moiré Pattern Aliasing
        // Physics: fine lead-strip frequency (near detector sampling limit) heterodynes
        // with the reader sampling frequency, producing BROAD low-frequency beat bands
        // (|f_grid - f_sample|). Draw faint strips + wide diagonal beat bands.
        ctx.save();
        ctx.beginPath();
        ctx.rect(radX, radY, radW, radH);
        ctx.clip();
        // (a) Faint lead-strip lines (exaggerated spacing for visibility)
        ctx.strokeStyle = isInverted ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        for (let gx = radX; gx < radX + radW; gx += 5) {
          ctx.beginPath();
          ctx.moveTo(gx, radY);
          ctx.lineTo(gx, radY + radH);
          ctx.stroke();
        }
        // (b) Broad beat bands: low-frequency interference, contrast scales with severity
        const beatAlpha = Math.min(0.5, 0.10 + sev * 0.32);
        ctx.translate(radX + radW / 2, radY + radH / 2);
        ctx.rotate(-0.32);
        ctx.fillStyle = isInverted ? `rgba(0,0,0,${beatAlpha})` : `rgba(255,255,255,${beatAlpha})`;
        const bandW = 34 + sev * 30, bandGap = 120;
        for (let bx = -radW; bx < radW; bx += bandW + bandGap) {
          ctx.fillRect(bx, -radH, bandW, radH * 2);
        }
        ctx.restore();
        renderArtifactCallout('⚠️ MOIRÉ BEAT BANDS (GRID FREQ vs READER SAMPLING)', false);

      } else if (idx === 3) {
        // Case 3: CR PSP Incomplete Optical Erasure Ghosting
        ctx.save();
        const ghostAlpha = Math.min(0.55, 0.15 + sev * 0.4);
        ctx.globalAlpha = ghostAlpha;
        ctx.translate(bX + 40, bY + 32);
        ctx.strokeStyle = isInverted ? '#000000' : '#ffffff';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(-15, -20, 28, 50, 0.25, 0, Math.PI * 2);
        ctx.ellipse(25, 12, 20, 34, -0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        renderArtifactCallout('⚠️ CR PHANTOM GHOSTING (INCOMPLETE ERASURE OF PREVIOUS EXAM)', true);

      } else if (idx === 4) {
        // Case 4: Radiopaque Metal Foreign Body (Zipper)
        const zipX = raw.location === 0 ? bX - 20 : radX + 40;
        const zipY = raw.location === 0 ? bY - 85 : radY + 80;
        const zipW = 40, zipH = 85;

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 8;
        ctx.fillRect(zipX, zipY, zipW, zipH);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
        ctx.strokeRect(zipX, zipY, zipW, zipH);

        for (let zy = zipY + 4; zy < zipY + zipH - 4; zy += 7) {
          ctx.beginPath();
          ctx.moveTo(zipX + 4, zy); ctx.lineTo(zipX + zipW / 2 - 2, zy);
          ctx.moveTo(zipX + zipW / 2 + 2, zy + 3.5); ctx.lineTo(zipX + zipW - 4, zy + 3.5);
          ctx.stroke();
        }
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(zipX + 7, zipY + 25, zipW - 14, 28);
        ctx.strokeRect(zipX + 7, zipY + 25, zipW - 14, 28);

        renderArtifactCallout('⚠️ RADIOPAQUE METAL FOREIGN OBJECT OVER DIAGNOSTIC VOI', true);

      } else if (idx === 5) {
        // Case 5: Patient Involuntary Motion Blur
        renderArtifactCallout('⚠️ SEVERE PATIENT MOTION UNSHARPNESS (TRABECULAE OBSCURED)', true);

      } else if (idx === 6) {
        // Case 6: Focused Grid Cutoff (off-level / off-center CR)
        // Physics: primary photons strike lead strips obliquely on ONE side, so signal
        // falls progressively toward that lateral margin (asymmetric, not bilateral).
        // Photon starvation there also raises quantum noise (noise ~ 1/sqrt(signal)).
        const cutPeak = 0.55 + sev * 0.4;
        const cutGrad = ctx.createLinearGradient(radX, 0, radX + radW * 0.6, 0);
        const veil = isInverted ? '255,255,255' : '0,0,0';
        cutGrad.addColorStop(0, `rgba(${veil},${Math.min(0.95, cutPeak).toFixed(2)})`);
        cutGrad.addColorStop(0.55, `rgba(${veil},${(cutPeak * 0.35).toFixed(2)})`);
        cutGrad.addColorStop(1, `rgba(${veil},0)`);
        ctx.fillStyle = cutGrad;
        ctx.fillRect(radX, radY, radW * 0.6, radH);

        // Seeded noise concentrated where the signal is lost (stable across frames)
        const cutRng = mulberry32(idx * 7919 + Math.round(sev * 97) + 13);
        const cutDots = Math.round(1100 * (0.35 + sev * 0.65));
        const dotTone = isInverted ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
        ctx.fillStyle = dotTone;
        for (let i = 0; i < cutDots; i++) {
          const rx = radX + radW * 0.55 * Math.pow(cutRng(), 1.6);
          const ry = radY + cutRng() * radH;
          ctx.fillRect(rx, ry, 1.5, 1.5);
        }
        renderArtifactCallout('⚠️ FOCUSED GRID CUTOFF (OFF-LEVEL / OFF-CENTER — ONE-SIDED LOSS)', true);

      } else if (idx === 7) {
        // Case 7: Screen-Film Static Discharge (Tree / Crown Spark)
        // Physics: handling friction sparks expose emulsion as HAIRLINE dark dendrites
        // starting at film edges (plus occasional circular crown bursts). Static marks
        // are dark (added density), so draw dark on standard view, light on invert.
        ctx.save();
        ctx.strokeStyle = isInverted ? 'rgba(255,255,255,0.85)' : 'rgba(4,7,12,0.85)';

        function drawBranch(x, y, len, angle, depth) {
          if (depth <= 0 || len < 2) return;
          const nx = x + Math.cos(angle) * len;
          const ny = y + Math.sin(angle) * len;
          ctx.lineWidth = Math.max(0.5, depth * 0.5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(nx, ny);
          ctx.stroke();
          drawBranch(nx, ny, len * 0.72, angle - 0.42, depth - 1);
          drawBranch(nx, ny, len * 0.66, angle + 0.5, depth - 1);
        }
        // Tree 1: left film edge over soft tissue (visible against mid-gray)
        drawBranch(radX + 6, radY + radH * 0.58, 30 + 26 * sev, -0.5, 6);
        // Tree 2: bottom edge discharge
        drawBranch(radX + radW * 0.3, radY + radH - 4, 24 + 20 * sev, -Math.PI / 2, 5);
        // Crown burst: radial hairlines around a central spark point
        const crownX = radX + radW * 0.7, crownY = radY + radH * 0.3;
        ctx.lineWidth = 0.7;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
          const r0 = 3, r1 = 9 + 9 * sev;
          ctx.beginPath();
          ctx.moveTo(crownX + Math.cos(a) * r0, crownY + Math.sin(a) * r0);
          ctx.lineTo(crownX + Math.cos(a) * r1, crownY + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
        renderArtifactCallout('⚠️ STATIC TREE & CROWN SPARKS (LOW-HUMIDITY HANDLING)', false);

      } else if (idx === 8) {
        // Case 8: Automatic Processor Pi Lines
        ctx.save();
        const piSpacing = 72;
        for (let py = radY + 25; py < radY + radH; py += piSpacing) {
          ctx.fillStyle = 'rgba(0,0,0,0.58)';
          ctx.fillRect(radX, py, radW, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.48)';
          ctx.fillRect(radX, py + 4, radW, 1.8);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.68)'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(radX + 115, radY); ctx.lineTo(radX + 115, radY + radH);
        ctx.moveTo(radX + 230, radY); ctx.lineTo(radX + 230, radY + radH);
        ctx.stroke();
        ctx.restore();
        renderArtifactCallout('⚠️ AUTOMATIC PROCESSOR PI LINES & GUIDE-SHOE SCRATCHES', false);

      } else if (idx === 9) {
        // Case 9: Quantum Mottle
        const noiseCount = Math.round(2000 * sev);
        ctx.fillStyle = isInverted ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
        for (let i = 0; i < noiseCount; i++) {
          const nx = colX + Math.random() * colW;
          const ny = colY + Math.random() * colH;
          ctx.fillRect(nx, ny, 1.5, 1.5);
        }
        renderArtifactCallout('⚠️ SEVERE QUANTUM MOTTLE (PHOTON STARVATION — LOW mAs)', true);
      } else {
        // Case 0: Clean Baseline
        renderArtifactCallout('✅ OPTIMAL DIAGNOSTIC RADIOGRAPH (NO ARTIFACT DETECTED)', false);
      }

      // Artifact Impact Zone Overlay (when requested)
      if (isOverlay && idx !== 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 5]);
        const ovX = raw.location === 0 ? bX - 60 : radX + 25;
        const ovY = raw.location === 0 ? bY - 80 : radY + 30;
        const ovW = raw.location === 0 ? 120 : 85;
        const ovH = raw.location === 0 ? 150 : 95;
        ctx.strokeRect(ovX, ovY, ovW, ovH);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.fillRect(ovX, ovY, ovW, ovH);
        ctx.setLineDash([]);
        const voiLabel = `VOI IMPACT: ${raw.voiImpact}%`;
        ctx.fillStyle = '#fca5a5';
        setFittedFont(ctx, voiLabel, ovW - 12, 11.5, '900', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        ctx.fillText(voiLabel, ovX + 6, ovY - 7);
      }

      // Lead Anatomical Side Marker Rendering
      const markX = radX + radW - 44;
      const markY = radY + 42;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 6;
      ctx.font = '900 26px Segoe UI, Arial';
      ctx.fillText('R', markX, markY);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#38bdf8'; ctx.font = '800 11px monospace';
      ctx.fillText('LEAD R', markX - 8, markY + 17);

      // Patient Demographics Overlay (Top Left Pill)
      ctx.fillStyle = 'rgba(10, 29, 46, 0.92)';
      ctx.fillRect(radX + 8, radY + 8, 265, 36);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1.2;
      ctx.strokeRect(radX + 8, radY + 8, 265, 36);

      ctx.fillStyle = '#f1f5f9';
      setFittedFont(ctx, 'PT: AL-ANAZI, S. (M/38) | MRN: 883921', 265 - 16, 11.5, '800', 'monospace');
      ctx.fillText('PT: AL-ANAZI, S. (M/38) | MRN: 883921', radX + 16, radY + 23);
      ctx.fillStyle = '#7dd3fc';
      setFittedFont(ctx, 'EXAM: AP KNEE (RT) | ' + art.modality, 265 - 16, 11, '700', 'monospace');
      ctx.fillText('EXAM: AP KNEE (RT) | ' + art.modality, radX + 16, radY + 37);

      // Radiograph Technical Footer
      ctx.fillStyle = 'rgba(6, 19, 32, 0.95)';
      ctx.fillRect(radX, radY + radH - 26, radW, 26);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1.2;
      ctx.strokeRect(radX, radY + radH - 26, radW, 26);

      const footRight = `WW: ${ww} · WL: ${wl} | ${isInverted ? 'INVERT' : 'STD'}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#cbd5e1'; ctx.font = '800 11.5px monospace';
      const rightW = ctx.measureText(footRight).width;
      ctx.fillText(footRight, radX + radW - 10, radY + radH - 8);
      const footTitle = `CASE ${idx}: ${art.name.toUpperCase()}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#38bdf8';
      setFittedFont(ctx, footTitle, radW - rightW - 30, 12, '800', 'monospace');
      ctx.fillText(footTitle, radX + 10, radY + radH - 8);
      ctx.textAlign = 'left';

      ctx.restore();

      // =========================================================================
      // RIGHT PANEL: ROOT CAUSE, IMAGE TRACER & ALARA DISPOSITION (x: 504 -> 986)
      // =========================================================================
      const pX = 504, pY = 12, pW = 482, pH = 436;
      ctx.fillStyle = '#0a1d2e';
      ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
      ctx.strokeRect(pX, pY, pW, pH);

      // Dashboard Header
      ctx.fillStyle = '#38bdf8'; ctx.font = '900 14.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('SYSTEMATIC ROOT CAUSE & ALARA CRITIQUE ENGINE', pX + 16, pY + 22);
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11.5px -apple-system, sans-serif';
      ctx.fillText('5-Stage IMAGE Process Root-Cause Analysis & Repeat Gating', pX + 16, pY + 38);

      // 5-Stage IMAGE Process Tracer Cards
      const stageKeys = ['I', 'M', 'A', 'G', 'E'];
      const stageFullNames = [
        'I — Initial Setup & Plate Erasure',
        'M — Manual Factors & Technique (mAs/kVp)',
        'A — Anatomy Preparation & Gowning',
        'G — Guidance & Beam/Grid Alignment',
        'E — Evaluation & Hardware/Process QA'
      ];

      stageKeys.forEach((key, sIdx) => {
        const sY = pY + 46 + sIdx * 47;
        const sScore = art.stageScores[key] || 90;
        const isRootOrigin = art.stageOrigin.includes(key);

        ctx.fillStyle = '#061320';
        ctx.fillRect(pX + 10, sY, pW - 20, 41);
        ctx.strokeStyle = isRootOrigin ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 197, 94, 0.4)';
        ctx.lineWidth = isRootOrigin ? 1.8 : 1.2;
        ctx.strokeRect(pX + 10, sY, pW - 20, 41);

        // Stage Title (kept clear of the ROOT ORIGIN badge and the score bar)
        ctx.fillStyle = isRootOrigin ? '#fca5a5' : '#f8fafc';
        setFittedFont(ctx, stageFullNames[sIdx], isRootOrigin ? 226 : 306, 13, '800', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        ctx.fillText(stageFullNames[sIdx], pX + 16, sY + 16);

        // Origin Badge
        if (isRootOrigin) {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(pX + 250, sY + 5, 88, 14);
          ctx.fillStyle = '#ffffff'; ctx.font = '900 10px -apple-system, sans-serif';
          ctx.fillText('ROOT ORIGIN', pX + 258, sY + 16);
        }

        // Explanation snippet (word-aware, never cut mid-word or into the score bar)
        ctx.fillStyle = isRootOrigin ? '#f87171' : '#cbd5e1'; ctx.font = '600 11.5px -apple-system, sans-serif';
        const explText = isRootOrigin ? art.decision : (key === 'E' ? 'Quality gate standard' : 'Process parameters verified');
        ctx.fillText(fitEllipsis(ctx, explText, 306), pX + 16, sY + 33);

        // Score bar on right
        const barX = pX + pW - 152, barY = sY + 10, barW = 80, barH = 10;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = sScore >= 80 ? '#22c55e' : sScore >= 50 ? '#facc15' : '#ef4444';
        ctx.fillRect(barX, barY, barW * (sScore / 100), barH);

        // Score text
        ctx.fillStyle = isRootOrigin ? '#ef4444' : '#22c55e';
        ctx.font = '900 12.5px -apple-system, sans-serif';
        ctx.fillText(isRootOrigin ? 'FAIL' : 'PASS', pX + pW - 58, sY + 18);
        ctx.fillStyle = '#e2e8f0'; ctx.font = '800 12.5px monospace';
        ctx.fillText(sScore + '%', pX + pW - 58, sY + 33);
      });

      // =========================================================================
      // CLINICAL ALARA DISPOSITION CARD (Bottom Right, y: 288 to 428)
      // =========================================================================
      const vY = pY + 288, vW = pW - 20, vH = 140;
      const isRepeat = raw.isRepeatJustified;
      const isQuarantine = art.isQuarantineNeeded;
      const isPostProcess = art.dispositionType === 'postprocess' || (!isRepeat && !isQuarantine && idx !== 0);

      ctx.fillStyle = isQuarantine ? '#3b0764' : isRepeat ? '#450a0a' : isPostProcess ? '#422006' : '#052e16';
      drawRoundRect(ctx, pX + 10, vY, vW, vH, 8);
      ctx.fill();
      ctx.strokeStyle = isQuarantine ? '#a855f7' : isRepeat ? '#dc2626' : isPostProcess ? '#d97706' : '#16a34a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Disposition Header (kept clear of the QUALITY pill)
      ctx.fillStyle = isQuarantine ? '#e9d5ff' : isRepeat ? '#fca5a5' : isPostProcess ? '#fde68a' : '#86efac';
      ctx.font = '900 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(fitEllipsis(ctx, raw.disposition, vW - 128 - 26), pX + 18, vY + 22);

      // Score Pill
      ctx.fillStyle = '#ffffff'; ctx.font = '900 13.5px monospace';
      ctx.fillText(`QUALITY: ${Math.round(result.score)}/100`, pX + vW - 128, vY + 22);

      // Primary Finding
      ctx.fillStyle = '#f8fafc'; ctx.font = '700 12.5px -apple-system, sans-serif';
      ctx.fillText(fitEllipsis(ctx, `Finding: ${raw.decision}`, vW - 28), pX + 18, vY + 44);

      // Action Directive
      ctx.fillStyle = '#94a3b8'; ctx.font = '800 12px -apple-system, sans-serif';
      ctx.fillText('Action Directive:', pX + 18, vY + 64);
      ctx.fillStyle = isQuarantine ? '#f3e8ff' : isRepeat ? '#fecaca' : isPostProcess ? '#fef08a' : '#bbf7d0';
      ctx.font = '700 12px -apple-system, sans-serif';

      // Multi-line wrap for corrective action (measured, max 2 lines + ellipsis)
      ctx.font = '700 12px -apple-system, sans-serif';
      const actionLines = wrapLines(ctx, raw.correctiveAction, vW - 28, 2);
      ctx.fillText(actionLines[0] || '', pX + 18, vY + 80);
      if (actionLines[1]) ctx.fillText(actionLines[1], pX + 18, vY + 96);

      // Prevention directive (label + fitted single line)
      ctx.fillStyle = '#94a3b8'; ctx.font = '800 11.5px -apple-system, sans-serif';
      ctx.fillText('Prevention Protocol:', pX + 18, vY + 114);
      ctx.fillStyle = '#cbd5e1'; ctx.font = '600 11.5px -apple-system, sans-serif';
      ctx.fillText(fitEllipsis(ctx, art.prevention, vW - 160 - 8), pX + 160, vY + 114);

      // Bottom ALARA note
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 11px -apple-system, sans-serif';
      ctx.fillText('ALARA: re-expose only if the VOI is unrecoverable.', pX + 18, vY + 130);
    }

    // Score meter badge
    ctx.fillStyle = result.score >= 75 ? '#10b981' : result.score >= 50 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(w - 180, h - 26, 150 * (result.score / 100), 10);
    ctx.strokeStyle = '#d8e8ee'; ctx.lineWidth = 1;
    ctx.strokeRect(w - 180, h - 26, 150, 10);
  }

  const RadModels = {
    compute(type, values) {
      if (!calculators[type]) throw new Error(`Unknown simulation type: ${type}`);
      return calculators[type](values);
    },
    draw,
    round
  };

  global.RadModels = RadModels;
  if (typeof module !== 'undefined' && module.exports) module.exports = RadModels;
})(typeof window !== 'undefined' ? window : globalThis);

// surface/pil.js — PILs (linhas de inversão de polaridade) do Br evoluído:
// readback do sim para âncoras de proeminências. Corpo movido verbatim.

import * as THREE from 'three';
import { quadVertex } from '../glsl/common.js';

export function createPIL(ctx){
  var renderer = ctx.renderer, quadCamera = ctx.quadCamera,
      makeFullscreenScene = ctx.makeFullscreenScene, srand = ctx.srand,
      simRTs = ctx.simRTs;

  // ---------------------------------------------------------------
  // T1.1: PILs do Br EVOLUÍDO para as âncoras das proeminências.
  // O canal G do sim é copiado a um RT 128x64 RGBA8 (1 blit + readPixels
  // por RENASCIMENTO — custo desprezível) e o JS procura linhas de
  // inversão com o MESMO critério do bake (|Br| pequeno + fluxo oposto
  // em volta): o filamento que a rotação leva ao limbo é o que vira
  // proeminência, e a âncora acompanha o campo evoluído do momento.
  // ---------------------------------------------------------------
  var PIL_W = 128, PIL_H = 64;
  var pilRT = new THREE.WebGLRenderTarget(PIL_W, PIL_H, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    depthBuffer: false, stencilBuffer: false });
  var pilCopyUniforms = { tSrc: { value: null } };
  var pilCopyMaterial = new THREE.ShaderMaterial({ uniforms: pilCopyUniforms, vertexShader: quadVertex, fragmentShader: [
    'uniform sampler2D tSrc;',
    'varying vec2 vUv;',
    'void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).g, 0.0, 0.0, 1.0); }'
  ].join('\n') });
  var pilCopyScene = makeFullscreenScene(pilCopyMaterial);
  var pilBuf = new Uint8Array(PIL_W*PIL_H*4);
  var pilStats = { mode: 'none', candidates: 0 };
  function pilBrAt(x, y){
    x = ((x % PIL_W) + PIL_W) % PIL_W;
    y = Math.max(0, Math.min(PIL_H-1, y));
    return pilBuf[(y*PIL_W + x)*4] / 127.5 - 1.0;
  }
  function refreshPILBuffer(){
    pilCopyUniforms.tSrc.value = simRTs[ctx.simIndex].texture;
    var prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(pilRT);
    renderer.render(pilCopyScene, quadCamera);
    renderer.readRenderTargetPixels(pilRT, 0, 0, PIL_W, PIL_H, pilBuf);
    renderer.setRenderTarget(prevRT);
  }
  function samplePILAnchor(){
    try {
      refreshPILBuffer();
      var cands = [];
      for (var y=7; y<PIL_H-7; y++){          // evita |lat| > ~70 graus
        var lat0 = ((y+0.5)/PIL_H - 0.5) * Math.PI;
        var cl0 = Math.max(Math.cos(lat0), 0.35);
        for (var x=0; x<PIL_W; x++){
          var br = pilBrAt(x, y);
          if (Math.abs(br) > 0.16) continue;
          var bL = pilBrAt(x-2, y), bR = pilBrAt(x+2, y);
          var bD = pilBrAt(x, y-2), bU = pilBrAt(x, y+2);
          if (bR*bL >= 0.0 && bU*bD >= 0.0) continue;   // precisa inverter
          var gx = (bR - bL)/cl0, gy = bU - bD;         // gradiente angular
          var g = Math.sqrt(gx*gx + gy*gy);
          if (g < 0.14) continue;               // PIL de campo morto não sustenta
          cands.push({ x:x, y:y, gx:gx, gy:gy, s: Math.min(g, 1.2) });
        }
      }
      pilStats.candidates = cands.length;
      if (!cands.length){ pilStats.mode = 'fallback'; return null; }
      var tot = 0; cands.forEach(function(c){ tot += c.s; });
      var r = srand()*tot, c = cands[cands.length-1];
      for (var i=0;i<cands.length;i++){ r -= cands[i].s; if (r <= 0){ c = cands[i]; break; } }
      var lon = (c.x+0.5)/PIL_W * Math.PI*2;
      var lat = ((c.y+0.5)/PIL_H - 0.5) * Math.PI;
      var cl = Math.cos(lat);
      var anchor = new THREE.Vector3(cl*Math.cos(lon), Math.sin(lat), cl*Math.sin(lon));
      // tangente da PIL (perpendicular ao gradiente de Br no plano
      // tangente): o cartão nasce ALINHADO ao canal do filamento — como
      // um hedgerow real, que corre AO LONGO da linha neutra
      var east = new THREE.Vector3(-Math.sin(lon), 0, Math.cos(lon));
      var north = new THREE.Vector3(-Math.sin(lat)*Math.cos(lon), Math.cos(lat), -Math.sin(lat)*Math.sin(lon));
      var t3 = east.multiplyScalar(-c.gy).add(north.multiplyScalar(c.gx));
      if (t3.lengthSq() > 1e-8) anchor.pilTangent = t3.normalize();
      pilStats.mode = 'pil';
      return anchor;
    } catch(e){ pilStats.mode = 'fallback'; return null; }
  }
  return { pilBrAt: pilBrAt, refreshPILBuffer: refreshPILBuffer,
           samplePILAnchor: samplePILAnchor, pilStats: pilStats };
}

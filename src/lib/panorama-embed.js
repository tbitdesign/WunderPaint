/**
 * 360° panorama embed builder (v1.379.0): one self-contained HTML
 * snippet - inline style block, inline script, the image URL as its only
 * outside reference. Premium handling: the embed starts as a light
 * poster with a 360° badge and boots WebGL lazily (viewport or click),
 * then offers auto-rotate, a compass that flies back to the start view,
 * gyro control on phones, pinch and double-tap zoom, smooth eased camera
 * moves, and hotspots as pills, icon markers with hover labels or
 * openable info cards.
 *
 * The WebGL shaders are imported from panorama.js, so the embed and the
 * in-editor viewer can never drift apart on the projection.
 */

import { PANO_VERT, PANO_FRAG } from './panorama';
import { safeUrl } from './safe-url';

/** JSON that is safe inside an inline <script> block. */
const jsData = ( value ) =>
	JSON.stringify( value )
		.replace( /</g, '\\u003c' )
		.replace( />/g, '\\u003e' );

// Hotspot links: web schemes only, a javascript: URL never ships. The rule
// itself moved to safe-url.js on 10 August 2026, when the extension catalogue
// turned out to need exactly the same judgement; it had been written here
// first and copying it a second time would have been how the two versions
// start to drift.

/** Hotspot styling shared by the editor viewer and the embed (v1.378.2). */
export const HOTSPOT_SIZES = { s: 11, m: 13, l: 16 };
export const HOTSPOT_DEFAULT_COLOR = '#151a24';

/** Icon markers (v1.379): tiny shared SVG bodies, 24x24 viewBox. */
export const HOTSPOT_ICONS = {
	pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
	info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/>',
	arrow: '<path d="M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z"/>',
	play: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14V8l6 4z"/>',
};

/** Black or white text, whichever reads on the pill color. */
export function hotspotTextColor( color ) {
	const n = parseInt(
		String( color || HOTSPOT_DEFAULT_COLOR ).replace( '#', '' ),
		16
	);
	if ( Number.isNaN( n ) ) {
		return '#ffffff';
	}
	const luma =
		0.299 * ( ( n >> 16 ) & 255 ) +
		0.587 * ( ( n >> 8 ) & 255 ) +
		0.114 * ( n & 255 );
	return luma > 150 ? '#101318' : '#ffffff';
}

/**
 * Build the embed snippet.
 *
 * @param {Object}  opts            Options.
 * @param {string}  opts.src        Public image URL (equirectangular 2:1).
 * @param {Array}   opts.hotspots   [{ yaw, pitch, label, url, color,
 *                                  size, icon, text }].
 * @param {number}  opts.height     CSS height in px.
 * @param {number}  opts.yaw        Initial view yaw (deg).
 * @param {boolean} opts.autoRotate Start with the slow turntable on.
 * @param {string}  opts.poster     Small data-URI poster (blur-up).
 * @return {string} HTML snippet.
 */
export function panoramaEmbedHtml( {
	src,
	hotspots = [],
	height = 480,
	yaw = 0,
	autoRotate = false,
	poster = '',
} ) {
	const data = jsData( {
		src,
		yaw,
		ar: autoRotate ? 1 : 0,
		hotspots: hotspots.map( ( hotspot ) => ( {
			yaw: hotspot.yaw,
			pitch: hotspot.pitch,
			label: String( hotspot.label || '' ).slice( 0, 120 ),
			url: safeUrl( hotspot.url ),
			text: String( hotspot.text || '' ).slice( 0, 600 ),
			icon: HOTSPOT_ICONS[ hotspot.icon ] ? hotspot.icon : '',
			c: /^#[0-9a-f]{6}$/i.test( hotspot.color || '' )
				? hotspot.color
				: HOTSPOT_DEFAULT_COLOR,
			tc: hotspotTextColor( hotspot.color ),
			fs: HOTSPOT_SIZES[ hotspot.size ] || HOTSPOT_SIZES.m,
		} ) ),
	} );
	const h = Math.max( 120, Math.round( height ) );
	const posterAttr = poster
		? ` src="${ String( poster ).replace( /"/g, '' ) }"`
		: '';
	return `<div class="wpano" style="position:relative;width:100%;height:${ h }px;overflow:hidden;border-radius:8px;background:#101318;touch-action:none">
<style>
.wpano canvas{width:100%;height:100%;display:block;cursor:grab;opacity:0;transition:opacity .5s}
.wpano.on canvas{opacity:1}
.wpano .wpano-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(6px);transform:scale(1.05);transition:opacity .5s}
.wpano.on .wpano-poster{opacity:0;pointer-events:none}
.wpano .wpano-badge{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px;background:rgba(10,13,20,.72);color:#fff;padding:10px 18px;border-radius:999px;font:600 15px/1 sans-serif;letter-spacing:.4px;cursor:pointer;transition:opacity .4s}
.wpano.on .wpano-badge{opacity:0;pointer-events:none}
.wpano .wpano-fs{position:absolute;right:10px;top:10px;width:34px;height:34px;border:0;border-radius:6px;background:rgba(0,0,0,.45);color:#fff;font-size:16px;cursor:pointer}
.wpano .wpano-ctl{position:absolute;right:10px;bottom:10px;display:flex;gap:6px;opacity:0;transition:opacity .4s}
.wpano.on .wpano-ctl{opacity:1}
.wpano .wpano-btn{width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.wpano .wpano-btn.on{background:rgba(59,102,255,.85)}
.wpano .wpano-btn svg{width:18px;height:18px;fill:currentColor}
.wpano .wpano-needle{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:12px solid #ff5a5a;position:relative;top:-1px}
.wpano .wpano-hs{position:absolute;transform:translate(-50%,-50%);border:0;padding:0;background:none;cursor:pointer}
.wpano .wpano-ic{display:flex;align-items:center;justify-content:center;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.wpano .wpano-ic svg{width:62%;height:62%}
.wpano .wpano-lbl{position:absolute;left:50%;bottom:calc(100% + 7px);transform:translateX(-50%);background:rgba(10,13,20,.85);color:#fff;padding:4px 10px;border-radius:12px;font:12px/1.3 sans-serif;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s}
.wpano .wpano-hs:hover .wpano-lbl,.wpano .wpano-hs:focus .wpano-lbl{opacity:1}
.wpano .wpano-pill{display:inline-block;padding:5px 11px;border-radius:14px;font:13px/1.3 sans-serif;text-decoration:none;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.wpano .wpano-card{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);max-width:min(86%,340px);background:rgba(12,15,22,.94);color:#fff;border-radius:10px;padding:14px 16px;font:13px/1.5 sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.5)}
.wpano .wpano-card h5{margin:0 0 6px;font-size:14px}
.wpano .wpano-card p{margin:0}
.wpano .wpano-card a{display:inline-block;margin-top:9px;color:#8fb0ff;text-decoration:none;font-weight:600}
.wpano .wpano-card .wpano-x{position:absolute;right:8px;top:6px;background:none;border:0;color:#aab;cursor:pointer;font-size:15px}
</style>
<img class="wpano-poster" alt=""${ posterAttr }>
<span class="wpano-badge">⟳ 360°</span>
<canvas></canvas>
<button type="button" class="wpano-fs" aria-label="Fullscreen">⛶</button>
<div class="wpano-ctl"></div>
<script>
(function(){
var D=${ data };
var VS=${ JSON.stringify( PANO_VERT ) };
var FS=${ JSON.stringify( PANO_FRAG ) };
var IC=${ jsData( HOTSPOT_ICONS ) };
var box=document.currentScript.parentNode,cv=box.querySelector('canvas'),ctl=box.querySelector('.wpano-ctl');
var yaw=(D.yaw||0)*Math.PI/180,pitch=0,fov=70*Math.PI/180;
var vx=0,vy=0,drag=null,dirty=true,booted=false,gl=null,U=null;
var anim=null,rotOn=!!D.ar,lastAct=0,gyro=null,marks=[],card=null;
var pts={},pinch=0,lastUp=0;
function now(){return Date.now();}
function act(){lastAct=now();}
function animateTo(ty,tp,tf,ms){var f={y:yaw,p:pitch,f:fov},t0=now();anim={run:function(){var k=Math.min(1,(now()-t0)/(ms||900));k=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;yaw=f.y+(ty-f.y)*k;pitch=f.p+(tp-f.p)*k;fov=f.f+((tf||f.f)-f.f)*k;dirty=true;if(k>=1){anim=null;}}};}
function boot(){if(booted){return;}booted=true;
gl=cv.getContext('webgl')||cv.getContext('experimental-webgl');
if(!gl){box.querySelector('.wpano-badge').textContent='This 360 view needs WebGL.';return;}
function sh(t,s){var x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);return x;}
var pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
var lp=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
U=function(n){return gl.getUniformLocation(pr,n);};
var img=new Image();img.crossOrigin='anonymous';
img.onload=function(){var tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
box.className+=' on';yaw=((D.yaw||0)-24)*Math.PI/180;animateTo((D.yaw||0)*Math.PI/180,0,fov,1400);act();dirty=true;};
img.src=D.src;}
D.hotspots.forEach(function(hs){var el=document.createElement(hs.url&&!hs.text?'a':'button');el.className='wpano-hs';if(el.tagName==='A'){el.href=hs.url;}else{el.type='button';}
var inner;
if(hs.icon){inner=document.createElement('span');inner.className='wpano-ic';var d=hs.fs*2.1;inner.style.width=d+'px';inner.style.height=d+'px';inner.style.background=hs.c;inner.style.color=hs.tc;inner.innerHTML='<svg viewBox="0 0 24 24">'+IC[hs.icon]+'</svg>';var lb=document.createElement('span');lb.className='wpano-lbl';lb.textContent=hs.label||'';el.appendChild(inner);if(hs.label){el.appendChild(lb);}}
else{inner=document.createElement('span');inner.className='wpano-pill';inner.style.background=hs.c;inner.style.color=hs.tc;inner.style.fontSize=hs.fs+'px';inner.textContent=hs.label||'•';el.appendChild(inner);}
if(hs.text){el.addEventListener('click',function(e){e.preventDefault();openCard(hs);});}
box.appendChild(el);marks.push({hs:hs,el:el});});
function openCard(hs){closeCard();card=document.createElement('div');card.className='wpano-card';
var x=document.createElement('button');x.className='wpano-x';x.textContent='✕';x.addEventListener('click',closeCard);card.appendChild(x);
if(hs.label){var t=document.createElement('h5');t.textContent=hs.label;card.appendChild(t);}
var p=document.createElement('p');p.textContent=hs.text;card.appendChild(p);
if(hs.url){var a=document.createElement('a');a.href=hs.url;a.textContent='→';card.appendChild(a);}
box.appendChild(card);}
function closeCard(){if(card){card.remove();card=null;}}
function button(label,svg){var bt=document.createElement('button');bt.type='button';bt.className='wpano-btn';bt.setAttribute('aria-label',label);bt.innerHTML=svg;ctl.appendChild(bt);return bt;}
if(window.DeviceOrientationEvent&&'ontouchstart' in window){var gb=button('Gyro','<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6z"/><path d="M12 1l4 4-4 4z"/></svg>');
gb.addEventListener('click',function(){if(gyro){window.removeEventListener('deviceorientation',gyro);gyro=null;gb.className='wpano-btn';return;}
function on(){gyro=function(e){if(e.alpha==null){return;}yaw=(-e.alpha)*Math.PI/180;pitch=Math.max(-1.4,Math.min(1.4,(e.beta-60)*Math.PI/180));dirty=true;};window.addEventListener('deviceorientation',gyro);gb.className='wpano-btn on';}
if(window.DeviceOrientationEvent.requestPermission){window.DeviceOrientationEvent.requestPermission().then(function(r){if(r==='granted'){on();}});}else{on();}});}
var rb=button('Auto-rotate','<svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 0 1 7 7h2a9 9 0 1 0-3 6.7V21h2v-5h-5v2h1.6A7 7 0 1 1 12 5z"/></svg>');
if(rotOn){rb.className='wpano-btn on';}
rb.addEventListener('click',function(){rotOn=!rotOn;rb.className='wpano-btn'+(rotOn?' on':'');act();});
var cb=button('Reset view','<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/></svg>');
cb.innerHTML='';var nd=document.createElement('span');nd.className='wpano-needle';cb.appendChild(nd);
cb.addEventListener('click',function(){animateTo((D.yaw||0)*Math.PI/180,0,70*Math.PI/180,900);act();});
function place(){var W=box.clientWidth,H=box.clientHeight,th=Math.tan(fov/2),a=W/H;
var cf=[Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw)];
var cr=[Math.cos(yaw),0,-Math.sin(yaw)];
var cu=[cr[1]*cf[2]-cr[2]*cf[1],cr[2]*cf[0]-cr[0]*cf[2],cr[0]*cf[1]-cr[1]*cf[0]];
marks.forEach(function(m){var yb=m.hs.yaw*Math.PI/180,pb=m.hs.pitch*Math.PI/180;
var d=[Math.cos(pb)*Math.sin(yb),Math.sin(pb),Math.cos(pb)*Math.cos(yb)];
var z=d[0]*cf[0]+d[1]*cf[1]+d[2]*cf[2];
var vis=booted&&z>0.05;var x=0,y=0;
if(vis){var px=(d[0]*cr[0]+d[1]*cr[1]+d[2]*cr[2])/z/(th*a);var py=(d[0]*cu[0]+d[1]*cu[1]+d[2]*cu[2])/z/th;vis=Math.abs(px)<1.1&&Math.abs(py)<1.1;x=W/2+px*W/2;y=H/2-py*H/2;}
m.el.style.display=vis?'block':'none';
if(vis){m.el.style.left=x+'px';m.el.style.top=y+'px';}});
nd.style.transform='rotate('+(yaw*180/Math.PI)+'deg)';}
var last=now();
function frame(){var t=now(),dt=Math.min(50,t-last);last=t;
var dpr=window.devicePixelRatio||1,W=box.clientWidth,H=box.clientHeight;
if(booted&&gl){
if(cv.width!==W*dpr||cv.height!==H*dpr){cv.width=W*dpr;cv.height=H*dpr;gl.viewport(0,0,cv.width,cv.height);dirty=true;}
if(anim){anim.run();}
else if(!drag&&(Math.abs(vx)>1e-4||Math.abs(vy)>1e-4)){yaw+=vx;pitch+=vy;vx*=0.93;vy*=0.93;dirty=true;}
else if(rotOn&&!drag&&!gyro&&t-lastAct>3500){yaw+=0.00012*dt;dirty=true;}
pitch=Math.max(-1.45,Math.min(1.45,pitch));
if(dirty){gl.uniform1f(U('yaw'),yaw);gl.uniform1f(U('pitch'),pitch);gl.uniform1f(U('fov'),fov);gl.uniform1f(U('aspect'),W/H);gl.drawArrays(gl.TRIANGLES,0,3);place();dirty=false;}}
requestAnimationFrame(frame);}
cv.addEventListener('pointerdown',function(e){act();anim=null;pts[e.pointerId]=e;if(Object.keys(pts).length===1){drag={x:e.clientX,y:e.clientY};vx=0;vy=0;cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing';}});
cv.addEventListener('pointermove',function(e){if(!pts[e.pointerId]){return;}pts[e.pointerId]=e;var ids=Object.keys(pts);
if(ids.length===2){var a=pts[ids[0]],b=pts[ids[1]];var dd=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(pinch){fov=Math.max(0.5,Math.min(1.9,fov*pinch/dd));dirty=true;}pinch=dd;drag=null;return;}
if(!drag){return;}var s=fov/box.clientHeight;vx=-(e.clientX-drag.x)*s;vy=(e.clientY-drag.y)*s;yaw+=vx;pitch+=vy;drag={x:e.clientX,y:e.clientY};dirty=true;act();});
function up(e){delete pts[e.pointerId];pinch=0;if(drag){var t=now();if(t-lastUp<320){animateTo(yaw,pitch,(fov>0.9?40:70)*Math.PI/180,500);}lastUp=t;}drag=null;cv.style.cursor='grab';act();}
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',function(e){e.preventDefault();fov=Math.max(0.5,Math.min(1.9,fov+e.deltaY*0.001));dirty=true;act();},{passive:false});
box.querySelector('.wpano-fs').addEventListener('click',function(){if(document.fullscreenElement){document.exitFullscreen();}else if(box.requestFullscreen){box.requestFullscreen();}});
box.querySelector('.wpano-badge').addEventListener('click',boot);
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){boot();io.disconnect();}});},{threshold:0.25});io.observe(box);}else{boot();}
frame();
})();
</script>
</div>`;
}

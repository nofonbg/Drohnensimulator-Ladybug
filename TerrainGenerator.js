/*
  TerrainGenerator - prozedurale Berglandschaft nach three.js TerrainGenerator
  ============================================================================
  Basis: examples/jsm/generators/TerrainGenerator.js des Projekts three.js
  (c) 2010-2026 die three.js-Autoren, MIT-Lizenz, Quelle:
  https://github.com/mrdoob/three.js/blob/master/examples/jsm/generators/TerrainGenerator.js

  Algorithmus laut Originaldatei: domain-warptes, abgeleitungsgedämpftes
  Perlin-Rauschen formt die Berggrate; thermische (Talus-)Erosion entschärft
  steile Hänge über den Winkel der Ruhe; ein Material färbt Gras, Fels und
  Schnee nach HÖHE und NEIGUNG (im Original in TSL geschrieben). Die
  gebackene Höhenmatrix steht über sampleHeight()/sampleSlope() zur Verfügung,
  um Wälder und andere Objekte auf dem Gelände zu platzieren.

  Eingebettet: ImprovedNoise aus examples/jsm/math/ImprovedNoise.js desselben
  Projekts (MIT, Perlin-Noise 2002 von Ken Perlin) - das Original importiert
  sie als ES-Modul.

  Anpassungen für dieses Projekt (three.js r147, klassische <script>-Datei,
  globales THREE statt ES-Modulen, kein TSL/WebGPU):
  - import-/export-Anweisungen entfernt; die Datei legt die Klasse
    TerrainGenerator global ab (index.html lädt sie nach three.min.js)
  - Das Original baut in build() ein QUADRATISCHES Gitter-Mesh. Hier bleibt
    bewusst die vorhandene Kreisscheibe des Projekts die Geometrie, denn sie
    trägt die Horizont-Kontinuität mit der Himmelkuppel (GROSS_R = HORIZON_R+4,
    s. index.html) sowie Küsten- und Wasserlogik. Stattdessen backt bake()
    nur das quadratische HÖHENFELD (mit Erosion) über ±size/2; die Kreisscheibe
    samplingt es über sampleHeight(), ebenso die Flugphysik (floorY).
  - Das Original-Material MeshStandardNodeMaterial (three/webgpu + three/tsl)
    gibt es in r147 nicht. Ersatz: colorAt() wertet dieselben Farbbänder
    (Wiese, trockenes Gras, Wald, Fels, Schutt, Flechten, Schnee) in
    JavaScript aus und schreibt sie als VERTEX-FARBEN, die das
    MeshLambertMaterial der Kreisscheibe multipliziert. Zusätzlich liefert
    colorAt() die Texturmaske t (0 = wiese.jpg, 1 = felswand.jpg): index.html
    hängt einen Dual-Texture-Shader ans Bodenmaterial und mischt die beiden
    Fotos pro Vertex. Die Trennung der beiden Flächenarten erfolgt über die
    ERHEBUNG (nicht über die Farbe, s. colorAt). Die
    "aerial perspective" (Entfernungsaufhellung pro Pixel) entfällt, weil sie
    an die Kameradistanz gekoppelt ist und pro Vertex nicht darstellbar ist.
  - Die TSL-Hilfsfunktionen (smoothstep, mix, mx_noise_float) sind als kleine
    JS-Helfer nachgebaut; als Rauschen dient dasselbe ImprovedNoise wie im
    Höhenfeld (feste z-Schritte statt der 2D-Variante).

  Für einen festen seed ist das Ergebnis immer identisch; index.html vergibt
  bei jedem Laden und jedem Neustart einen neuen Zufalls-Seed, damit die
  Landschaft bei jedem Start neu "gewürfelt" wird.
*/

// ---- eingebettetes ImprovedNoise (three.js, MIT) ---------------------------
// Quelle: examples/jsm/math/ImprovedNoise.js; lerp kommt hier direkt von
// Math (identischer Wert wie THREE.MathUtils.lerp)
const _pNoise=[ 151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10,
  23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87,
  174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211,
  133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208,
  89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5,
  202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119,
  248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
  178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249,
  14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205,
  93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180 ];
for(let iNoise=0;iNoise<256;iNoise++) _pNoise[256+iNoise]=_pNoise[iNoise];

function fadeNoise(t){ return t*t*t*(t*(t*6-15)+10); }
function gradNoise(hash,x,y,z){
  const h=hash&15;
  const u=h<8?x:y, v=h<4?y:(h===12||h===14?x:z);
  return ((h&1)===0?u:-u)+((h&2)===0?v:-v);
}
// 3D-Perlin-Noise nach Ken Perlin 2002 ("Improved Noise"), Wertebereich ~-1..1
class ImprovedNoise{
  noise(x,y,z){
    const fx=Math.floor(x), fy=Math.floor(y), fz=Math.floor(z);
    const X=fx&255, Y=fy&255, Z=fz&255;
    x-=fx; y-=fy; z-=fz;
    const xm=x-1, ym=y-1, zm=z-1;
    const u=fadeNoise(x), v=fadeNoise(y), w=fadeNoise(z);
    const A=_pNoise[X]+Y, AA=_pNoise[A]+Z, AB=_pNoise[A+1]+Z, B=_pNoise[X+1]+Y, BA=_pNoise[B]+Z, BB=_pNoise[B+1]+Z;
    const lerp=(a,b,t)=>a+(b-a)*t;
    return lerp(
      lerp(
        lerp(gradNoise(_pNoise[AA],x,y,z),   gradNoise(_pNoise[BA],xm,y,z),   u),
        lerp(gradNoise(_pNoise[AB],x,ym,z),  gradNoise(_pNoise[BB],xm,ym,z),  u), v),
      lerp(
        lerp(gradNoise(_pNoise[AA+1],x,y,zm), gradNoise(_pNoise[BA+1],xm,y,zm), u),
        lerp(gradNoise(_pNoise[AB+1],x,ym,zm),gradNoise(_pNoise[BB+1],xm,ym,zm),u), v), w);
  }
}

// ---- deterministisches PRNG (mulberry32), Original aus TerrainGenerator.js --
// Für einen seed immer dieselbe Landschaft.
function createRandom(seed){
  let s=(seed>>>0)||1;
  return function(){
    s=(s+0x6D2B79F5)|0;
    let t=Math.imul(s^(s>>>15),1|s);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

// ---- TSL-Ersatz: kleine JS-Helfer ------------------------------------------
// smoothstep(min,max,x) mit erlaubten umgekehrten Kanten (das Original ruft
// smoothstep(0.62,0.32,...) auf, um abnehmend zu glätten - der Ausdruck
// (x-min)/(max-min) liefert das dann auch korrekt mit Klammern 1..0)
function tsSmoothstep(a,b,x){
  let t=(x-a)/(b-a);
  t=t<0?0:t>1?1:t;
  return t*t*(3-2*t);
}
function tsMix(a,b,t){ return a+(b-a)*t; }
// Hexfarbe als {r,g,b} in 0..1 (äquivalent zu TSL color(0x......))
function tsColor(hex){
  return { r:((hex>>16)&255)/255, g:((hex>>8)&255)/255, b:(hex&255)/255 };
}
// Kanalweise Multiplikation zweier Farben (TSL: color.mul(color))
function mulColor(a,b){ return { r:a.r*b.r, g:a.g*b.g, b:a.b*b.b }; }
// kanalweise Mischung (TSL: mix(colorA,colorB,t) mit Skalar t)
function mixColor(a,b,t){ return { r:tsMix(a.r,b.r,t), g:tsMix(a.g,b.g,t), b:tsMix(a.b,b.b,t) }; }

// ---- Höhenfeld: domain-warp + abgeleitungsgedämpfte Fraktalsumme -----------
// Original: heightField(p) in TerrainGenerator.js - hier unverändert über-
// nommen (deutsche Anmerkungen), nur ohne Import der Noise-Klasse.
function heightField(p){
  const perlin=new ImprovedNoise();
  const random=createRandom(p.seed);

  // ImprovedNoise hat eine feste Permutation - ein seed verschiebt deshalb
  // nur das Sampelfenster: Versatz in x/z und ein Oktaven-Z-Schritt
  const offsetX=random()*256;
  const offsetZ=random()*256;
  const slice=random()*256;

  const {frequency,octaves,lacunarity,gain,erosion,warp,valleyBias,seaLevel,heightScale}=p;

  // niedrigfrequente Fraktalsumme, die die SAMPLE-POSITION verformt (Domain Warp)
  function warpField(x,z,zr){
    let freq=1, amp=1, sum=0, norm=0;
    for(let i=0;i<2;i++){
      sum+=amp*perlin.noise(x*freq+offsetX, z*freq+offsetZ, zr+i*1.7);
      norm+=amp; freq*=lacunarity; amp*=gain;
    }
    return sum/norm;
  }

  // abgeleitungsgedämpfte Fraktalsumme: jede Oktave wird dort heruntergerechnet,
  // wo der laufende Gradient schon steil ist - Grate bleiben scharf, Täler glatt.
  // Das Domain dreht sich zwischen den Oktaven ~37°, damit kein Achsenraster
  // des Rauschens durchscheint.
  function eroded(x,z){
    let sum=0, amp=1, dX=0, dZ=0, px=x, pz=z, freq=1;
    const e=0.004;// endliche Differenz in Rauseinheiten
    for(let i=0;i<octaves;i++){
      const zr=slice+i*1.7;
      const bx=px*freq+offsetX, bz=pz*freq+offsetZ;
      const n=perlin.noise(bx,bz,zr);
      const nx=perlin.noise(bx+e,bz,zr);
      const nz=perlin.noise(bx,bz+e,zr);
      // Gradient dieser Oktave in Welteinheiten (Kettenregel: × freq)
      dX+=(nx-n)/e*freq;
      dZ+=(nz-n)/e*freq;
      sum+=amp*n/(1+erosion*(dX*dX+dZ*dZ));
      // Domain um ~37° drehen (Matrix [0.8 -0.6; 0.6 0.8])
      const rx=0.8*px-0.6*pz;
      pz=0.6*px+0.8*pz;
      px=rx;
      freq*=lacunarity; amp*=gain;
    }
    return sum*0.5+0.5;
  }

  return function(worldX,worldZ){
    const x=worldX*frequency, z=worldZ*frequency;
    // Warp, damit Grate und Täler mäandern statt gerade zu laufen
    const wx=x+warp*warpField(x+1.3,z+7.2,slice+40);
    const wz=z+warp*warpField(x+5.2,z+1.3,slice+70);
    // Potenzkurve: legt das Niedrigland auf einen flachen Boden (Talboden)
    const h=Math.pow(Math.min(eroded(wx,wz)*1.1,1),valleyBias);
    return (h-seaLevel)*heightScale;
  };
}

// ---- thermische (Talus-)Erosion auf dem gebackenen Gitter -------------------
// Original unverändert: Eine Zelle, die über den Talus-Abfall eines Nachbarn
// hinausragt, gibt Material hangabwärts ab; nach einigen Durchgängen liegen
// die Hänge im Winkel der Ruhe. Spitzen (an allen Seiten steil) bluten am
// schnellsten aus, breite einseitige Flächen behalten ihre Form. Material wird
// über einen Delta-Puffer erhalten, das Ergebnis ist zellreihenunabhängig.
function thermalErode(h,N,cellSize,talus,passes){
  const drop=talus*cellSize;// max. Höhensprung zwischen zwei Zellen
  const carry=0.5;// Anteil des steilsten Überhangs pro Durchgang (<=0.5 = stabil)
  const delta=new Float32Array(N*N);
  const ex=[0,0,0,0];
  const off=[-1,1,-N,N];
  for(let p=0;p<passes;p++){
    delta.fill(0);
    for(let z=0;z<N;z++){
      for(let x=0;x<N;x++){
        const i=z*N+x;
        const hi=h[i];
        // Überhang über den Talus jedes der 4 Nachbarn hinweg
        ex[0]=x>0?hi-h[i-1]-drop:0;
        ex[1]=x<N-1?hi-h[i+1]-drop:0;
        ex[2]=z>0?hi-h[i-N]-drop:0;
        ex[3]=z<N-1?hi-h[i+N]-drop:0;
        let sum=0, peak=0;
        for(let k=0;k<4;k++){
          const d=ex[k];
          if(d<=0){ ex[k]=0; continue; }
          sum+=d;
          if(d>peak) peak=d;
        }
        if(sum<=0) continue;
        // einen Teil des steilsten Überhangs bewegen, auf die talusnahen
        // Nachbarn verteilt nach deren Abstand zur Taluslinie
        const move=carry*peak;
        delta[i]-=move;
        for(let k=0;k<4;k++){
          if(ex[k]>0) delta[i+off[k]]+=move*ex[k]/sum;
        }
      }
    }
    for(let k=0;k<N*N;k++) h[k]+=delta[k];
  }
}

// =============================================================================
class TerrainGenerator{

  constructor(parameters={}){
    this.parameters=Object.assign({},TerrainGenerator.defaults,parameters);
    // Hinweis: das Original legt hier das TSL-Shadermaterial an; in r147 wird
    // die Färbung stattdessen pro Vertex vorberechnet (colorAt), siehe Kopf
    this.heights=null;
    this.gridSize=0;
    this.minY=0;
    this.maxY=1;
    this.perlin=new ImprovedNoise();// auch für die Farbräuschen in colorAt
  }

  // Höhenfeld backen: Koordinatenraster, heightField pro Zelle, thermische
  // Erosion (Original: Teil von build(), hier ohne anschließendes Mesh, weil
  // die Kreisscheibe des Projekts die Geometrie bleibt)
  bake(){
    const p=this.parameters;
    const N=p.segments+1;
    const half=p.size/2;
    // Weltkoordinate der Rasterlinien
    const coord=new Array(N);
    for(let i=0;i<N;i++) coord[i]=i/p.segments*p.size-half;
    // Höhenmatrix - danach bilinear abtastbar (sampleHeight)
    const height=heightField(p);
    const heights=new Float32Array(N*N);
    for(let iz=0;iz<N;iz++){
      for(let ix=0;ix<N;ix++){
        heights[iz*N+ix]=height(coord[ix],coord[iz]);
      }
    }
    // Hänge über dem Winkel der Ruhe entschärfen, Nadelzähne des Fraktals
    // abstreifen
    if(p.talusPasses>0) thermalErode(heights,N,p.size/p.segments,p.talus,p.talusPasses);
    let min=Infinity, max=-Infinity;
    for(let k=0;k<N*N;k++){
      const y=heights[k];
      if(y<min) min=y;
      if(y>max) max=y;
    }
    this.heights=heights;
    this.gridSize=N;
    this.minY=min;
    this.maxY=max;
    return this;
  }

  // Welthöhe bei (x,z), bilinear aus der gebackenen Matrix (Klamping am Rand
  // des Feldes: außerhalb bleibt der Randwert gültig)
  sampleHeight(x,z){
    const p=this.parameters;
    const N=this.gridSize;
    const half=p.size/2;
    const fx=Math.max(0,Math.min(p.segments,(x+half)/p.size*p.segments));
    const fz=Math.max(0,Math.min(p.segments,(z+half)/p.size*p.segments));
    const ix=Math.min(N-2,Math.floor(fx));
    const iz=Math.min(N-2,Math.floor(fz));
    const tx=fx-ix, tz=fz-iz;
    const h=this.heights;
    const h00=h[iz*N+ix], h10=h[iz*N+ix+1];
    const h01=h[(iz+1)*N+ix], h11=h[(iz+1)*N+ix+1];
    return (h00*(1-tx)+h10*tx)*(1-tz)+(h01*(1-tx)+h11*tx)*tz;
  }

  // Flachheit bei (x,z): y-Anteil des Normalenvektors (1 = eben, -> 0 = Klippe).
  // Ohne Allokation, um viele Kandidatenstellen (Baumplätze) billig zu prüfen.
  sampleSlope(x,z){
    const e=this.parameters.size/this.parameters.segments;
    const hx=this.sampleHeight(x+e,z)-this.sampleHeight(x-e,z);
    const hz=this.sampleHeight(x,z+e)-this.sampleHeight(x,z-e);
    return 2*e/Math.sqrt(hx*hx+4*e*e+hz*hz);
  }

  // Vertex-Farbe an Weltposition (x,y,z) bei Welt-Normalen-y = flatness (ny):
  // JS-Port des TSL-Materials terrainMaterial() des Originals. Zwei Treiber:
  // normierte Höhe (Tal 0 -> Gipfel 1) und Flachheit der Fläche. Die
  // Rauschskalen sind gegenüber dem Original leicht angehoben, weil die
  // Spielwelt ~5x größer ist als das 200-Einheiten-Beispielfeld
  // (Feinkante ~33 u, Korn ~12 u, Makro ~83 u).
  // ACHTUNG y = ROHwert aus dem Feld (so wie minY/maxY gemessen sind); der
  // Mesh-Versatz -1 der Kreisscheibe spielt für die Bänder keine Rolle.
  colorAt(x,y,z,ny){
    const p=this.perlin;
    const altitude=tsSmoothstep(this.minY,this.maxY,y);
    const flatness=ny<0?0:ny>1?1:ny;// Welt-Normalen-y, 1 = eben
    const steep=1-flatness;

    // dieselben drei Skalen wie im Original (detail/grain/macro), als
    // 3D-Perlin mit festen z-Schritten statt mx_noise_float (2D)
    const detail=p.noise(x*0.03, z*0.03, 7.3);
    const grain =p.noise(x*0.08, z*0.08, 21.9);
    const macro =p.noise(x*0.012,z*0.012,44.1);
    // mx_noise_float liegt etwa in -0.5..0.5 -> auf 0..1 ziehen, damit die
    // smoothstep-Kanten wie im Original greifen
    const d01=v=>v*0.5+0.5;
    const detailN=d01(detail), grainN=d01(grain), macroN=d01(macro);

    const grass=tsColor(0x6e7253);// trocken-salbeigrüne Wiese (kein Videospiel-Grün)
    const dryGrass=tsColor(0x8a8550);
    const forest=tsColor(0x39402f);// dunkles Waldmittelband unter den Bäumen
    const rock=tsColor(0x716e68);// verwitterter graubrauner Fels
    const scree=tsColor(0x837a6f);// hellerer Schutt unter den Klippen
    const lichen=tsColor(0x6c7355);// gedämpftes Graugrün auf flachem Fels
    const snow=tsColor(0xe9ecf0);// frischer Schnee; warm/kühl kommt aus dem Licht
    const snowDeep=tsColor(0xccd6e2);// kühl verwehter Schnee in Flecken

    // zwei Bandfrequenzen von hellerem/dunklerem Stein, vom Rauschen
    // verwellt -> Klippen lesen sich als geschichtete Bankstatt als Flachgrau
    const bandA=Math.sin(y*0.5+x*0.08+z*0.05+detailN*3+macroN*4);
    const bandB=Math.sin(y*1.4+grainN*2);
    const strata=(bandA*0.6+bandB*0.4)*0.5+0.5;

    // Flechten kriechen auf den unteren, milden Fels; Klippen und Hochland
    // bleiben bare grau
    const lichenMask=tsSmoothstep(0.45,0.72,grainN)*tsSmoothstep(0.62,0.32,steep)*tsSmoothstep(0.66,0.34,altitude);
    const rockShade=mulColor(mixColor(rock,lichen,lichenMask*0.45),
                    mulColor({r:strata*0.36+0.8,g:strata*0.36+0.8,b:strata*0.36+0.8},
                             {r:grainN*0.18+1,g:grainN*0.18+1,b:grainN*0.18+1}));

    // Wiese, in Makroflecken zu trockenem Gras übergehend, in einem Mittelband
    let surface=mixColor(grass,dryGrass,
      tsSmoothstep(0.15,0.75,macroN)*tsSmoothstep(0.22,0.5,altitude));

    // dunkles Waldband auf den milden Mittelhängen (dort stehen die Bäume)
    surface=mixColor(surface,forest,
      tsSmoothstep(0.16,0.34,altitude)*tsSmoothstep(0.5,0.72,flatness)*0.75);

    // Fels: über der Höhe UND auf jeder steilen Fläche, unabhängig von der Höhe
    const wFelsHoehe=tsSmoothstep(0.46,0.64,altitude+detailN*0.06);
    const wFelsNeigung=tsSmoothstep(0.34,0.62,steep);
    surface=mixColor(surface,rockShade,wFelsHoehe);
    surface=mixColor(surface,rockShade,wFelsNeigung);

    // Schutt auf dem mittelsteilen Boden unter den Klippen, vom Rauschen zerhackt
    const screeMask=tsSmoothstep(0.42,0.7,steep)*tsSmoothstep(0.35,0.7,flatness)*(detailN*0.5+0.5);
    surface=mixColor(surface,scree,screeMask*0.5);

    // Schnee auf hohem, flachem Boden; das Korn bricht die Linie, damit Fels
    // an der Schneegrenze hervorschaut statt auf einer sauberen Kontur zu enden
    const snowMask=tsSmoothstep(0.56,0.78,altitude+detailN*0.08+grainN*0.05)*tsSmoothstep(0.45,0.75,flatness);
    const snowColor=mixColor(snow,snowDeep,tsSmoothstep(0.2,0.7,grainN)*0.6);
    surface=mixColor(surface,snowColor,snowMask);

    // ---- Textur-Maske t: ANTEIL der felswand.jpg an diesem Vertex ----
    // index.html mixt daraus felswand.jpg gegen wiese.jpg (Shader in mt6).
    // TRENNMECHANISMUS = ERHEBUNG: Die Farbbänder mischen Fels schon ab
    // altitude 0.46 (≈ Welthöhe 3) ein, dort ist die Farbe aber noch klar
    // grün (Wiese, trockenes Gras, Wald) - genau diese tiefer liegenden
    // Zonen sollen Gras-Textur behalten. Die Textur läuft deshalb erst ab
    // altitude 0.58 auf Fels an und ist ab 0.70 voll (≈ Welthöhe 6..9).
    // Zusätzlich ziehen Schnee (helle Flächen), Schutt und echte Klippen
    // die Maske unabhängig von der Höhe hoch, damit weiße und steile
    // Flächen immer felswand.jpg bekommen.
    const tHoehe=tsSmoothstep(0.58,0.70,altitude+detailN*0.04);
    let felsAnteil=Math.max(tHoehe,snowMask);
    felsAnteil=Math.max(felsAnteil,screeMask*0.5);
    felsAnteil=Math.max(felsAnteil,wFelsNeigung);

    // dunkler, feuchter Boden in den tiefen, flachen Mulden (billiger
    // Feuchte-Ersatz)
    const cavity=tsSmoothstep(0.24,0.06,altitude)*flatness;
    surface={ r:surface.r*(1-cavity*0.32), g:surface.g*(1-cavity*0.32), b:surface.b*(1-cavity*0.32) };

    // Makro-Drift, dann feine Kornwolkung - kein Band ist eine Flachfarbe
    surface={ r:surface.r*((macroN*0.5+0.5)*0.3+0.84), g:surface.g*((macroN*0.5+0.5)*0.3+0.84), b:surface.b*((macroN*0.5+0.5)*0.3+0.84) };
    surface={ r:surface.r*((grainN*0.5+0.5)*0.12+0.94), g:surface.g*((grainN*0.5+0.5)*0.12+0.94), b:surface.b*((grainN*0.5+0.5)*0.12+0.94) };

    // "aerial perspective" (Entfernungsaufhellung) entfällt: die hing an der
    // Kameradistanz pro Pixel und ist nicht pro Vertex darstellbar.
    // Zusätzlich zur Farbe: t = Felsanteil (0 = wiese.jpg, 1 = felswand.jpg),
    // damit index.html die beiden Texturen pro Vertex mischen kann.
    surface.t=felsAnteil;
    return surface;
  }

  dispose(){
    this.heights=null;
    this.gridSize=0;
  }
}

TerrainGenerator.defaults={
  seed:1,
  size:200,// Welteinheiten über das quadratische Feld (Originalwert!)
  segments:192,// Gitterzellen pro Seite; Vertices = (segments+1)²
  heightScale:65,// Höhenüberhöhung Tal->Gipfel in Welteinheiten (Original)
  frequency:0.01,// Basisfrequenz (Grundfläche eines Berges)
  octaves:5,
  lacunarity:1.97,// Frequenzschritt je Oktave; absichtlich nicht 2 (kein Gitterversatz)
  gain:0.5,// Amplitudenschritt je Oktave (Persistenz)
  erosion:0.7,// Ableitungsdämpfung: größer = Täler flacher, Grate schärfer
  warp:0.35,// Stärke des Domain-Warps (in Rauseinheiten)
  valleyBias:1.2,// Potenz über die Höhe, flacht den Nebelboden
  seaLevel:0.15,// 0..1, wird VOR der Skalierung abgezogen (Talboden unter y=0)
  talus:1,// Erosionswinkel der Ruhe (Höhe/Laufweite): kleiner = flacher
  talusPasses:12// Erosionsdurchgänge (0 = aus)
};

// Globale Ablage für index.html (klassische <script>-Datei, siehe Kopf)
window.TerrainGenerator=TerrainGenerator;

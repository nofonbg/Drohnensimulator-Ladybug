/*
  TreeGenerator - prozeduraler Baumgenerator nach EZ-Tree
  =========================================================
  Basis: src/lib/tree.js, src/lib/rng.js, src/lib/branch.js und
  src/lib/options.js des Projekts "EZ-Tree" von Daniel Greenheck,
  MIT-Lizenz (c) 2024 Daniel Greenheck, Quellen:
  https://github.com/dgreenheck/ez-tree
  Algorithmus beschrieben im Codrops-Artikel
  "Fractals to Forests - Creating Realistic 3D Trees with Three.js"
  https://tympanus.net/codrops/2025/01/27/fractals-to-forests-creating-realistic-3d-trees-with-three-js/

  Anpassungen für dieses Projekt (three.js r147, klassische <script>-Datei,
  globales THREE statt ES-Modulen):
  - import-/export-Anweisungen entfernt; die Datei legt die Klasse
    TreeGenerator global ab (index.html lädt sie nach three.min.js)
  - Trellis (Spalierkraft) und LOD-Stufen entfallen: für vier einzelne
    Bäume auf der Landfläche wird nur die volle Detailstufe gebraucht
  - Materialien kommen von außen: index.html übergibt Rinden- und
    Blattmaterial (inklusive prozeduraler Texturen); der Generator hängt
    nur den Wind-Shader ans Blattmaterial
  - die Wind-GLSL (Simplex-Noise von ashima/webgl-noise, MIT) bleibt
    erhalten: mehrere Sinuswellen mit unterschiedlicher Frequenz schieben
    die Blattquads entlang der Windrichtung

  Algorithmus (wesentliche Regeln):
  - Ast-Queue statt direkter Rekursion: jeder Ast wird als Objekt
    (Ursprung, Ausrichtung, Länge, Radius, Ebene) eingereiht und
    nacheinander abgearbeitet
  - pro Ast Abschnitte (sections) mit Verjüngung; der letzte Abschnitt
    eines Endasts läuft auf Radius 0.001 zu
  - "gnarliness": pro Abschnitt zufällige Neigung, umgekehrt proportional
    zum Radius - dünne Zweige zwackeln mehr als der Stamm
  - Wachstumskraft (force): jeder Abschnitt wird um
    strength/radius gegen die Wachstumsrichtung (Sonne) gedreht, also
    stärker je dünner der Ast
  - Kinderäste entstehen stratifiziert am Elternast: Position,
    Radius und Ausrichtung werden zwischen zwei Abschnitten linear
    interpoliert, der Radialwinkel gleichmäßig verteilt und geshuffelt
  - Blätter: gekreuzte Quads (billboard "double") mit Alpha-Textur,
    gestreut nach demselben stratifizierten Verfahren wie Kinderäste;
    die Vertex-Normalen werden nach außen gerundet, damit die Krone
    weich wirkt

  Für einen festen seed ist das Ergebnis immer identisch (RNG nach
  Marsaglia, identisch zum Original).
*/

// ---- deterministischer Zufallsgenerator (Marsaglia ZWC) --------------------
// gleicher Algorithmus wie rng.js von EZ-Tree: random(max, min) - ACHTUNG die
// Reihenfolge der Parameter ist beim Original umgekehrt zu dem, was man erwartet
class BaumRNG {
  constructor(seed){
    this.mask=0xffffffff;
    this.m_w=(123456789+seed)&this.mask;
    this.m_z=(987654321-seed)&this.mask;
  }
  random(max=1,min=0){
    this.m_z=(36969*(this.m_z&65535)+(this.m_z>>16))&this.mask;
    this.m_w=(18000*(this.m_w&65535)+(this.m_w>>16))&this.mask;
    let result=((this.m_z<<16)+(this.m_w&65535))>>>0;
    result/=4294967296;
    return (max-min)*result+min;
  }
}

// ---- ein Ast in der Warteschlange -----------------------------------------
// (Pendant zu branch.js; Werte werden beim Einstellen bereits geklont)
class Ast {
  constructor(origin,orientation,length,radius,level,sectionCount,segmentCount){
    this.origin=origin.clone();
    this.orientation=orientation.clone();
    this.length=length;
    this.radius=radius;
    this.level=level;
    this.sectionCount=sectionCount;
    this.segmentCount=segmentCount;
  }
}

// ---- Standardwerte (Pendant zu options.js) --------------------------------
const TREE_DEFAULTS={
  seed:1,
  type:'deciduous',// 'deciduous' (Laub) | 'evergreen' (Nadel)
  bark:{textureScale:{x:1,y:1}},
  branch:{
    levels:3,
    angle:{1:70,2:60,3:60},      // Grad zwischen Kind und Elternast
    children:{0:7,1:7,2:5},      // Kinderäste pro Ebene
    force:{direction:{x:0,y:1,z:0},strength:0.01},// Wachstum Richtung Sonne
    gnarliness:{0:0.15,1:0.2,2:0.3,3:0.02},// Wackeln pro Abschnitt
    length:{0:20,1:20,2:10,3:1}, // Astlänge je Ebene (Welt-Einheiten)
    radius:{0:1.5,1:0.7,2:0.7,3:0.7},
    sections:{0:12,1:10,2:8,3:6},// Abschnitte entlang eines Astes
    segments:{0:8,1:6,2:4,3:3},  // Radialsegmente (Glattheit des Rohrs)
    start:{1:0.4,2:0.3,3:0.3},   // ab welchem Elternastanteil Kinder kommen
    taper:{0:0.7,1:0.7,2:0.7,3:0.7},// Verjüngung entlang des Astes
    twist:{0:0,1:0,2:0,3:0}      // Drehung um die eigene Achse
  },
  leaves:{
    billboard:'double',// 'single' | 'double' (gekreuzte Quads)
    angle:10,          // Blattneigung gegenüber dem Ast (Grad)
    count:1,           // Blätter pro Endast
    start:0,           // ab welchem Astanteil Blätter kommen
    size:2.5,          // Kantenlänge des Blattquads
    sizeVariance:0.7,  // Streuung der Größe (±Anteil)
    alphaTest:0.5      // transparente Texturpixel verwerfen
  }
};

// optionenA: flaches Mischen von Ebenen (defaults <- preset <- Aufruf);
// Plain-Objekte werden rekursiv gemischt, Texturen/Primitive per Wert
function optionenMischen(basis,extra){
  const out={};
  for(const k of Object.keys(basis)) out[k]=basis[k];
  for(const k of Object.keys(extra||{})){
    const v=extra[k];
    if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object'&&!Array.isArray(out[k])){
      out[k]=optionenMischen(out[k],v);
    }else{
      out[k]=v;
    }
  }
  return out;
}

class TreeGenerator {

  constructor(optionen){
    this.optionen=optionenMischen(TREE_DEFAULTS,optionen);
    this.skelett=null;
    this.warteschlange=[];
  }

  // baut die Bäume und gibt eine Gruppe mit ZWEI Meshes zurück:
  // [0] Ästgerüst (Rinde), [1] Blätter (Bilboards mit Wind-Shader)
  build(rindeMat,blattMat){
    this.skelett={branches:[],leaves:[]};
    this.rng=new BaumRNG(this.optionen.seed);
    this.warteschlange=[];

    const b=this.optionen.branch;
    // Stamm zuerst in die Queue
    this.warteschlange.push(new Ast(
      new THREE.Vector3(),new THREE.Euler(),
      b.length[0],b.radius[0],0,b.sections[0],b.segments[0]
    ));
    while(this.warteschlange.length>0){
      this.growBranch(this.warteschlange.shift());
    }

    const g=new THREE.Group();
    g.name='Tree';

    const astBuf=this.meshBranches();
    const astGeo=this.buildGeometry(astBuf);
    const astMesh=new THREE.Mesh(astGeo,rindeMat);
    astMesh.name='TreeRinde';
    astMesh.castShadow=true; astMesh.receiveShadow=true;
    g.add(astMesh);

    const blattBuf=this.meshLeaves();
    if(blattBuf.verts.length>0){
      // Wind-Shader ans Blattmaterial hängen (mehrfach pro Material nur einmal)
      this.attachWind(blattMat);
      const blattGeo=this.buildGeometry(blattBuf);
      const blattMesh=new THREE.Mesh(blattGeo,blattMat);
      blattMesh.name='TreeBlatt';
      blattMesh.castShadow=true; blattMesh.receiveShadow=true;
      g.add(blattMesh);
    }
    return g;
  }

  // ---- Wachstum -------------------------------------------------------------

  // Züchtet EINEN Ast: legt die Abschnitte (Position, Ausrichtung, Radius)
  // fest, sammelt sie und stellt die Kinderäste bzw. Blätter in die Queue
  growBranch(branch){
    const o=this.optionen;
    let sectionOrientation=branch.orientation.clone();
    let sectionOrigin=branch.origin.clone();
    const sectionLength=branch.length/branch.sectionCount;
    const sections=[];
    // Arbeitsvektoren/-quaternionen EINMAL pro Ast statt pro Abschnitt: die
    // Schleife unten läuft für jeden Abschnitt (12 pro Stammast) und hätte
    // sonst pro Durchgang rund acht kleine Objekte neu angelegt
    const schritt=new THREE.Vector3();// Abschnittsschritt entlang der Ausrichtung
    const twistAchse=new THREE.Vector3(0,1,0);// feste Achse für die Drehung (wird nie verändert)
    const oben=new THREE.Vector3();// Arbeits-Hochachse (pro Abschnitt neu gesetzt)
    const ziel=new THREE.Vector3().copy(o.branch.force.direction).normalize();// Wachstumsrichtung (konstant)
    const achse=new THREE.Vector3();// Drehachse der Wachstumskraft
    const qAbschnitt=new THREE.Quaternion();
    const qVerdreh=new THREE.Quaternion();
    const qKraft=new THREE.Quaternion();

    for(let i=0;i<=branch.sectionCount;i++){
      let sectionRadius=branch.radius;

      if(i===branch.sectionCount&&branch.level===o.branch.levels){
        sectionRadius=0.001;// Endast spitz zulaufen lassen
      }else if(o.type==='deciduous'){
        sectionRadius*=1-o.branch.taper[branch.level]*(i/branch.sectionCount);
      }else if(o.type==='evergreen'){
        // Nadelbäume haben keinen Terminalast, die Verjüngung läuft linear auf 0
        sectionRadius*=1-(i/branch.sectionCount);
      }

      sections.push({
        origin:sectionOrigin.clone(),
        orientation:sectionOrientation.clone(),
        radius:sectionRadius
      });

      schritt.set(0,sectionLength,0).applyEuler(sectionOrientation);
      sectionOrigin.add(schritt);

      // Knorrigkeit: umso dünner der Abschnitt, desto stärker das Wackeln
      const gnarliness=Math.max(1,1/Math.sqrt(sectionRadius))*o.branch.gnarliness[branch.level];
      sectionOrientation.x+=this.rng.random(gnarliness,-gnarliness);
      sectionOrientation.z+=this.rng.random(gnarliness,-gnarliness);

      // Wachstumskraft: Abschnitt um strength/radius Richtung Sonne drehen
      const qSection=qAbschnitt.setFromEuler(sectionOrientation);
      const qTwist=qVerdreh.setFromAxisAngle(twistAchse,o.branch.twist[branch.level]);
      qSection.multiply(qTwist);

      const sectionUp=oben.set(0,1,0).applyQuaternion(qSection);
      const axis=achse.crossVectors(sectionUp,ziel);
      const sinFull=axis.length();
      if(sinFull>1e-6){
        axis.divideScalar(sinFull);
        const fullAngle=Math.atan2(sinFull,sectionUp.dot(ziel));
        const step=o.branch.force.strength/sectionRadius;
        const clamped=Math.max(-fullAngle,Math.min(fullAngle,step));
        qSection.premultiply(qKraft.setFromAxisAngle(axis,clamped));
      }
      sectionOrientation.setFromQuaternion(qSection);
    }

    this.skelett.branches.push({
      sections:sections,
      segmentCount:branch.segmentCount,
      baseRadius:branch.radius
    });

    // Laubbäume: ein Terminalast wächst aus dem Ende des Elternastes weiter
    if(o.type==='deciduous'){
      const lastSection=sections[sections.length-1];
      if(branch.level<o.branch.levels){
        this.warteschlange.push(new Ast(
          lastSection.origin,lastSection.orientation,
          o.branch.length[branch.level+1],lastSection.radius,
          branch.level+1,branch.sectionCount,branch.segmentCount
        ));
      }else{
        this.recordLeaf(lastSection.origin,lastSection.orientation);
      }
    }

    if(branch.level===o.branch.levels){
      this.generateLeaves(sections);
    }else if(branch.level<o.branch.levels){
      this.generateChildBranches(
        o.branch.children[branch.level],branch.level+1,sections
      );
    }
  }

  // Kinderäste stratifiziert am Elternast verteilen
  generateChildBranches(count,level,sections){
    const o=this.optionen;
    const radialOffset=this.rng.random();
    const startMin=o.branch.start[level];
    const heightStep=(1.0-startMin)/count;
    const angleSlots=this.shuffledIndices(count);

    for(let i=0;i<count;i++){
      // stratifiziert: ein Slot pro Kind, innerhalb des Slots zufällig
      const childBranchStart=startMin+(i+this.rng.random())*heightStep;

      // Position zwischen zwei Abschnitten interpolieren
      const sectionIndex=Math.floor(childBranchStart*(sections.length-1));
      const sectionA=sections[sectionIndex];
      const sectionB=(sectionIndex===sections.length-1)?sectionA:sections[sectionIndex+1];
      const alpha=(childBranchStart-sectionIndex/(sections.length-1))/(1/(sections.length-1));

      const childBranchOrigin=new THREE.Vector3().lerpVectors(
        sectionA.origin,sectionB.origin,alpha
      );
      const childBranchRadius=o.branch.radius[level]*
        ((1-alpha)*sectionA.radius+alpha*sectionB.radius);

      // Ausrichtung interpolieren (Quaternion-Interpolation = slerp)
      const qA=new THREE.Quaternion().setFromEuler(sectionA.orientation);
      const qB=new THREE.Quaternion().setFromEuler(sectionB.orientation);
      const parentOrientation=new THREE.Euler().setFromQuaternion(
        qB.slerp(qA,alpha)
      );

      // Radialwinkel: Slot pro Kind, geshuffelt und zufällig gejittert -
      // sonst würden sich Höhen- und Winkelslot korrelieren
      const radialJitter=this.rng.random(0.5,-0.5);
      const radialAngle=2.0*Math.PI*(radialOffset+(angleSlots[i]+radialJitter)/count);
      const q1=new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1,0,0),o.branch.angle[level]/(180/Math.PI)
      );
      const q2=new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0,1,0),radialAngle
      );
      const q3=new THREE.Quaternion().setFromEuler(parentOrientation);
      const childBranchOrientation=new THREE.Euler().setFromQuaternion(
        q3.multiply(q2.multiply(q1))
      );

      // Nadelbäume: weiter unten am Stamm wachsen längere Äste (Kegelform)
      let childBranchLength=o.branch.length[level]*
        (o.type==='evergreen'?(1.0-childBranchStart):1.0);

      this.warteschlange.push(new Ast(
        childBranchOrigin,childBranchOrientation,
        childBranchLength,childBranchRadius,level,
        o.branch.sections[level],o.branch.segments[level]
      ));
    }
  }

  // Blätter am Endast verteilen - gleiches stratifiziertes Verfahren
  generateLeaves(sections){
    const o=this.optionen;
    const radialOffset=this.rng.random();
    const count=o.leaves.count;
    const startMin=o.leaves.start;
    const heightStep=(1.0-startMin)/count;
    const angleSlots=this.shuffledIndices(count);

    for(let i=0;i<count;i++){
      const leafStart=startMin+(i+this.rng.random())*heightStep;
      const sectionIndex=Math.floor(leafStart*(sections.length-1));
      const sectionA=sections[sectionIndex];
      const sectionB=(sectionIndex===sections.length-1)?sectionA:sections[sectionIndex+1];
      const alpha=(leafStart-sectionIndex/(sections.length-1))/(1/(sections.length-1));

      const leafOrigin=new THREE.Vector3().lerpVectors(
        sectionA.origin,sectionB.origin,alpha
      );
      const qA=new THREE.Quaternion().setFromEuler(sectionA.orientation);
      const qB=new THREE.Quaternion().setFromEuler(sectionB.orientation);
      const parentOrientation=new THREE.Euler().setFromQuaternion(qB.slerp(qA,alpha));

      const radialJitter=this.rng.random(0.5,-0.5);
      const radialAngle=2.0*Math.PI*(radialOffset+(angleSlots[i]+radialJitter)/count);
      const q1=new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1,0,0),o.leaves.angle/(180/Math.PI)
      );
      const q2=new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0,1,0),radialAngle
      );
      const q3=new THREE.Quaternion().setFromEuler(parentOrientation);
      const leafOrientation=new THREE.Euler().setFromQuaternion(q3.multiply(q2.multiply(q1)));

      this.recordLeaf(leafOrigin,leafOrientation);
    }
  }

  recordLeaf(origin,orientation){
    const o=this.optionen;
    const size=o.leaves.size*(1+this.rng.random(o.leaves.sizeVariance,-o.leaves.sizeVariance));
    this.skelett.leaves.push({
      origin:origin.clone(),
      orientation:orientation.clone(),
      size:size
    });
  }

  // Fisher-Yates-Mischung mit dem Baum-RNG (bleibt seed-treu)
  shuffledIndices(count){
    const arr=Array.from({length:count},(_,k)=>k);
    for(let k=count-1;k>0;k--){
      const r=Math.floor(this.rng.random()*(k+1));
      const h=arr[k]; arr[k]=arr[r]; arr[r]=h;
    }
    return arr;
  }

  // ---- Geometrie ------------------------------------------------------------

  // Ringe (sections) eines Astes als Rohr schreiben; ohne Deckel,
  // der erste Vertex jedes Rings wird doppelt für die UV-Naht
  meshBranches(){
    const o=this.optionen;
    // ZUERST zählen, DANN allozieren und füllen: die Puffer sind damit von
    // Anfang an typisierte Arrays - es entfallen das wachsende JS-Array und
    // der zweite Kopierschritt, den buildGeometry() vorher bei jedem Baum
    // über Float32Array(array) machen musste.
    let floatsGesamt=0, idxGesamt=0;
    for(const sb of this.skelett.branches){
      const seg=Math.max(3,sb.segmentCount);
      floatsGesamt+=sb.sections.length*(seg+1)*3;// Ringe inkl. Naht-Duplikat, je 3 Koordinaten
      idxGesamt+=(sb.sections.length-1)*seg*6;    // zwei Dreiecke pro Quad
    }
    const verts=new Float32Array(floatsGesamt);
    const normals=new Float32Array(floatsGesamt);
    const uvs=new Float32Array(floatsGesamt/3*2);
    const indices=floatsGesamt/3>65535?new Uint32Array(idxGesamt):new Uint16Array(idxGesamt);

    // Arbeitsvektoren für die Ringberechnung: EIN Satz für alle Ringe aller
    // Äste (sequenzielle Abarbeitung), statt zwei neue Vector3 pro Vertex
    const vertex=new THREE.Vector3();
    const normal=new THREE.Vector3();

    let vZ=0, uZ=0, iZ=0;// Schreibzeiger: Koordinaten-Floats, UV-Floats, Indizes
    for(const sb of this.skelett.branches){
      const {sections,segmentCount,baseRadius}=sb;
      const segments=Math.max(3,segmentCount);
      // Texturumdrehungen um den Umfang: skalieren mit dem Basisradius,
      // damit Rindenmuster auf Stamm und Zweig gleich groß wirken
      const wrapsX=Math.max(1,Math.round(baseRadius*o.bark.textureScale.x));

      const indexOffset=vZ/3;
      for(let k=0;k<sections.length;k++){
        const section=sections[k];
        // Komponenten des ersten Rings merken (als Zahlen, nicht als Vector3-
        // Referenz - der Arbeitsvektor wird im nächsten Durchgang überschrieben)
        let eX=0,eY=0,eZ=0,eNX=0,eNY=0,eNZ=0,eUV=0;
        for(let j=0;j<segments;j++){
          const angle=2.0*Math.PI*j/segments;
          const vx=Math.cos(angle), vz=Math.sin(angle);
          // Vertex im Abschnittsradius, in die Ausrichtung gedreht
          vertex.set(vx,0,vz)
            .multiplyScalar(section.radius)
            .applyEuler(section.orientation)
            .add(section.origin);
          normal.set(vx,0,vz).applyEuler(section.orientation).normalize();
          verts[vZ]=vertex.x;   normals[vZ]=normal.x;
          verts[vZ+1]=vertex.y; normals[vZ+1]=normal.y;
          verts[vZ+2]=vertex.z; normals[vZ+2]=normal.z;
          uvs[uZ]=(j/segments)*wrapsX; uvs[uZ+1]=(k%2===0)?0:1;
          vZ+=3; uZ+=2;
          if(j===0){ eX=vertex.x; eY=vertex.y; eZ=vertex.z;
                     eNX=normal.x; eNY=normal.y; eNZ=normal.z;
                     eUV=(k%2===0)?0:1; }
        }
        // doppelter erster Vertex -> UV-Naht schließen
        verts[vZ]=eX; verts[vZ+1]=eY; verts[vZ+2]=eZ;
        normals[vZ]=eNX; normals[vZ+1]=eNY; normals[vZ+2]=eNZ;
        uvs[uZ]=wrapsX; uvs[uZ+1]=eUV;
        vZ+=3; uZ+=2;
      }
      // Quads zwischen den Ringen
      const N=segments+1;
      for(let i=0;i<sections.length-1;i++){
        for(let j=0;j<segments;j++){
          const v1=indexOffset+i*N+j;
          const v2=v1+1;
          const v3=v1+N, v4=v2+N;
          indices[iZ++]=v1; indices[iZ++]=v3; indices[iZ++]=v2;
          indices[iZ++]=v2; indices[iZ++]=v3; indices[iZ++]=v4;
        }
      }
    }
    return {verts,normals,uvs,indices};
  }

  // Blätter als gekreuzte Quads (billboard 'double' = zwei um 90° gedrehte)
  meshLeaves(){
    const o=this.optionen;
    // Wie in meshBranches: erst zählen, dann typisierte Puffer füllen - die
    // Blattanzahl ist vorher bekannt (1 Quad, bei 'double' 2 je Blatt)
    const doppelt=o.leaves.billboard==='double';
    const quads=this.skelett.leaves.length*(doppelt?2:1);
    const floats=quads*4*3;// 4 Vertices à 3 Koordinaten je Quad
    const verts=new Float32Array(floats);
    const normals=new Float32Array(floats);
    const uvs=new Float32Array(quads*4*2);
    const indices=quads*4>65535?new Uint32Array(quads*6):new Uint16Array(quads*6);

    // Arbeitsobjekte: vier Eckenvektoren und drei Hilfsvektoren - EIN Satz
    // für alle Blätter (sequenzielle Abarbeitung), statt für jedes Quad rund
    // zehn neue Vector3/Euler anzulegen
    const ecken=[new THREE.Vector3(),new THREE.Vector3(),
                 new THREE.Vector3(),new THREE.Vector3()];
    const eul=new THREE.Euler();
    const richtung=new THREE.Vector3();
    const rund=new THREE.Vector3();

    let vZ=0, nZ=0, uZ=0, iZ=0;// Schreibzeiger: Koordinaten, Normalen, UVs, Indizes
    // origin/ orientation/ W/ L kommen als Argumente: die Funktion liegt
    // außerhalb der Blattschleife und darf nicht auf deren lokale Bindungen
    // zugreifen
    const createLeaf=(rotation,origin,orientation,W,L)=>{
      eul.set(0,rotation,0);
      ecken[0].set(-W/2,L,0);
      ecken[1].set(-W/2,0,0);
      ecken[2].set(W/2,0,0);
      ecken[3].set(W/2,L,0);
      for(const p of ecken) p.applyEuler(eul).applyEuler(orientation).add(origin);
      for(const p of ecken){ verts[vZ]=p.x; verts[vZ+1]=p.y; verts[vZ+2]=p.z; vZ+=3; }

      // Normalen: Grundrichtung des Blattes, je Vertex zum Eckenvektor
      // hin gerundet -> die Krone wirkt weich und kugelig statt flach
      richtung.set(0,0,1).applyEuler(orientation);
      for(const p of ecken){
        rund.copy(richtung).add(p).sub(origin).normalize();
        normals[nZ]=rund.x; normals[nZ+1]=rund.y; normals[nZ+2]=rund.z;
        nZ+=3;
      }
      uvs[uZ]=0; uvs[uZ+1]=1; uvs[uZ+2]=0; uvs[uZ+3]=0;
      uvs[uZ+4]=1; uvs[uZ+5]=0; uvs[uZ+6]=1; uvs[uZ+7]=1;
      uZ+=8;
      const b=vZ/3-4;// Vertex-Index des ersten der vier eben geschriebenen Ecken
      indices[iZ++]=b; indices[iZ++]=b+1; indices[iZ++]=b+2;
      indices[iZ++]=b; indices[iZ++]=b+2; indices[iZ++]=b+3;
    };

    for(const leaf of this.skelett.leaves){
      const {origin,orientation}=leaf;
      const leafSize=leaf.size;
      const W=leafSize, L=leafSize;
      createLeaf(0,origin,orientation,W,L);
      if(doppelt) createLeaf(Math.PI/2,origin,orientation,W,L);
    }
    return {verts,normals,uvs,indices};
  }

  // Typisierte Puffer (siehe meshBranches/meshLeaves) in eine BufferGeometry
  // übernehmen - die Daten liegen schon als Float32Array/Uint16|32Array vor,
  // deshalb wird hier nur noch umgehängt und nicht ein zweites Mal kopiert
  buildGeometry(buf){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(buf.verts,3));
    g.setAttribute('normal',new THREE.BufferAttribute(buf.normals,3));
    g.setAttribute('uv',new THREE.BufferAttribute(buf.uvs,2));
    g.setIndex(new THREE.BufferAttribute(buf.indices,1));
    g.computeBoundingSphere();
    return g;
  }

  // ---- Wind-Shader (nach EZ-Tree) -------------------------------------------
  // Hängt ans Blattmaterial: uv.y (0 unten .. 1 oben im Quad) skaliert die
  // Schwingung, mehrere Sinuswellen überlagern sich zu lebhaftem Flattern.
  // index.html aktualisiert uniforms.uTime in der Render-Schleife.
  attachWind(mat){
    if(mat.userData.windShader) return;// schon angehängt
    // Hinweis: three.js r147 ruft onBeforeCompile pro MATERIAL auf, sobald dessen
    // Mesh das erste Mal im Blickfeld gerendert wird (Bäume außerhalb des
    // Frustum werden gekullt und kompilieren erst später) - deshalb prüft
    // renderLoop() nur, ob userData.shader schon da ist, statt auf Alle zu warten
    mat.onBeforeCompile=(shader)=>{
      shader.uniforms.uTime={value:0};
      shader.uniforms.uWindStrength={value:new THREE.Vector3(1.1,0,1.1)};
      shader.uniforms.uWindFrequency={value:0.5};
      shader.uniforms.uWindScale={value:70};
      shader.uniforms.uCustomNormals={value:true};

      shader.vertexShader=`
        uniform float uTime;
        uniform vec3 uWindStrength;
        uniform float uWindFrequency;
        uniform float uWindScale;
      `+shader.vertexShader;

      // Simplex-Noise 3D, Quelle: https://github.com/ashima/webgl-noise (MIT)
      shader.vertexShader=shader.vertexShader.replace(
        'void main() {',
        `
        vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
        vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
        vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
        vec3 fade(vec3 t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
        float simplex3(vec3 v){
          const vec2 C=vec2(1.0/6.0,1.0/3.0);
          const vec4 D=vec4(0.0,0.5,1.0,2.0);
          vec3 i=floor(v+dot(v,C.yyy));
          vec3 x0=v-i+dot(i,C.xxx);
          vec3 g=step(x0.yzx,x0.xyz);
          vec3 l=1.0-g;
          vec3 i1=min(g.xyz,l.zxy);
          vec3 i2=max(g.xyz,l.zxy);
          vec3 x1=x0-i1+C.xxx;
          vec3 x2=x0-i2+C.yyy;
          vec3 x3=x0-D.yyy;
          i=mod289(i);
          vec4 p=permute(permute(permute(
                    i.z+vec4(0.0,i1.z,i2.z,1.0))
                  + i.y+vec4(0.0,i1.y,i2.y,1.0))
                  + i.x+vec4(0.0,i1.x,i2.x,1.0));
          float n_=0.142857142857;
          vec3 ns=n_*D.wyz-D.xzx;
          vec4 j=p-49.0*floor(p*ns.z*ns.z);
          vec4 x_=floor(j*ns.z);
          vec4 y_=floor(j-7.0*x_);
          vec4 x=x_*ns.x+ns.yyyy;
          vec4 y=y_*ns.x+ns.yyyy;
          vec4 h=1.0-abs(x)-abs(y);
          vec4 b0=vec4(x.xy,y.xy);
          vec4 b1=vec4(x.zw,y.zw);
          vec4 s0=floor(b0)*2.0+1.0;
          vec4 s1=floor(b1)*2.0+1.0;
          vec4 sh=-step(h,vec4(0.0));
          vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
          vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
          vec3 g0=vec3(a0.xy,h.x);
          vec3 g1=vec3(a0.zw,h.y);
          vec3 g2=vec3(a1.xy,h.z);
          vec3 g3=vec3(a1.zw,h.w);
          vec4 norm=taylorInvSqrt(vec4(dot(g0,g0),dot(g1,g1),dot(g2,g2),dot(g3,g3)));
          g0*=norm.x; g1*=norm.y; g2*=norm.z; g3*=norm.w;
          vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
          m=m*m;
          return 42.0*dot(m*m,vec4(dot(g0,x0),dot(g1,x1),dot(g2,x2),dot(g3,x3)));
        }
        void main() {`
      );

      shader.vertexShader=shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        vec4 mvPosition=vec4(transformed,1.0);
        float windOffset=2.0*3.14*simplex3(mvPosition.xyz/uWindScale);
        vec3 windSway=uv.y*uWindStrength*(
          0.5*sin(uTime*uWindFrequency+windOffset)+
          0.3*sin(2.0*uTime*uWindFrequency+1.3*windOffset)+
          0.2*sin(5.0*uTime*uWindFrequency+1.5*windOffset)
        );
        mvPosition.xyz+=windSway;
        mvPosition=modelViewMatrix*mvPosition;
        gl_Position=projectionMatrix*mvPosition;
        `
      );

      // Backface-Umkehr der Normalen unterdrücken: die Blätter tragen
      // gerundete Normalen, ein Flip würde die Krone von innen verdunkeln
      shader.fragmentShader='uniform bool uCustomNormals;\n'+
        shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          THREE.ShaderChunk.normal_fragment_begin.replace(
            'normal *= faceDirection;',
            'if(!uCustomNormals){normal*=faceDirection;}'
          )
        );

      Object.defineProperty(mat.userData,'shader',{
        value:shader,configurable:true,enumerable:false
      });
    };
    mat.needsUpdate=true;
  }

}

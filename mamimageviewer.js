class TMamImageViewer{
  constructor(){
    this.nowi=0;
    this.nowj=0;

    let style=document.createElement("style");
    document.head.appendChild(style);
    style.sheet.insertRule(`
      div.mamImageViewer{
        box-sizing:border-box;
        display:flex;
        flex-wrap:wrap;
        width:100%;margin:0;padding:0;
      }
    `,0);
    style.sheet.insertRule(`.mamImageViewer>div{margin:5px;padding:0px;}`,0);
    style.sheet.insertRule(`
      .mamImageViewer>div>img{
        width:200px;
        max-width:100%;
        margin:0;
        padding:0;
        /*filter:contrast(70%);*/
        transition:all 0.2s linear;
        border:1px solid #AAA;
      }
    `,0);
    style.sheet.insertRule(`
      .mamImageViewer>div>img:hover{
          /*filter:contrast(100%);*/
          /*transform:scale(1.06) rotateZ(-2deg);*/
          transform:scale(1.04);
        }
    `,0);
    style.sheet.insertRule('@keyframes mamImageViewerFadeIn {0%{opacity:0.0;} 100%{opacity:1.0;}}',0);
    style.sheet.insertRule('@keyframes mamImageViewerFadeOut{0%{opacity:1.0;} 100%{opacity:0.0;}}',0);

    //background(semi‑transparent)
    this.background=document.createElement("div");
    this.background.style.cssText=`position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,0.5);z-index:21001;display:none`;
    this.bk=document.createElement("div");
    this.bk.setAttribute("style","position:absolute;margin:auto;left:50%;top:50%;width:100%;height:100%;");
    this.background.appendChild(this.bk);
    this.image=document.createElement("img");
    this.image.style.cssText=`position:relative;margin:auto;transform:translate(-50%,-50%);user-select:none;`;
    this.image.addEventListener("load",this.mamImageViewerWinResize.bind(this));
    this.bk.appendChild(this.image);
    document.body.prepend(this.background);
    
    this.background.addEventListener("click",this.mamImageViewerClose.bind(this));

    //right arrow
    this.mamRightA=document.createElement("a");
    this.mamRightA.style.cssText=`
      display:block;z-index:21002;position:absolute;right:0;top:50%;
      transform:translate(0,-50%);opacity:0.8;margin:0;padding:0;
    `;
    this.mamRightA.addEventListener("click",function(e){
      e.stopPropagation();
      this.nowj++;
      this.mamImageViewerShowImage(e);//.bind(/*this,*/e);
    }.bind(this));
    this.mamRightA.innerHTML=`
      <svg viewBox="0 0 64 64" style="width:64px;height:64px;">
        <circle style="fill:#EEE;stroke:#666;stroke-width:2;" cx="32" cy="32" r="28" />
        <path d="M26,12 l14,14 a6.6,6.6 0,0,1 0,12 l-14,14 a5.2,5.2 0,0,1 -2,-10 l10,-10 l-10,-10 a5.2,5.2 0,0,1 2,-10 z" style="fill:#EEE;stroke:#999;stroke-width:4;stroke-linejoin:round;" />
      </svg>
    `;
    this.background.appendChild(this.mamRightA);

    //left arrow
    this.mamLeftA=document.createElement("a");
    this.mamLeftA.style.cssText=`
      display:block;z-index:21003;position:absolute;left:0;top:50%;
      transform:translate(0,-50%);opacity:0.8;margin:0;padding:0;
    `;
    this.mamLeftA.addEventListener("click",function(e){
      e.stopPropagation();
      this.nowj--;
      this.mamImageViewerShowImage(e);//.bind(/*this,*/e);
    }.bind(this));
    this.mamLeftA.innerHTML=`
      <svg viewBox="0 0 64 64" style="width:64px;height:64px;">
        <circle style="fill:#EEE;stroke:#666;stroke-width:2;" cx="32" cy="32" r="28" />
        <path d="M38,12 l-14,14 a6.6,6.6 0,0,0 0,12 l14,14 a5.2,5.2 0,0,0 2,-10 l-10,-10 l10,-10 a5.2,5.2 0,0,0 -2,-10 z" style="fill:#EEE;stroke:#999;stroke-width:4;stroke-linejoin:round;" />
      </svg>
    `;
    this.background.appendChild(this.mamLeftA);

    //title
    this.title=document.createElement("p");
    this.title.style.cssText=`
      position:absolute;width:100%;color:#fff;text-align:center;font-size:14pt;margin:0px;
      padding:4px;line-height:20pt;z-index:21004;text-shadow:1px 1px 2px #333;user-select:none;
    `;
    this.title.innerHTML="title";
    this.background.appendChild(this.title);

    this.img=document.querySelectorAll("div.mamImageViewer");
    this.imgs=[];
    for(let i=0;i<this.img.length;i++){
      this.imgs[i]=this.img[i].querySelectorAll("div>img");
      for(let j=0;j<this.imgs[i].length;j++){
        this.imgs[i][j].style.height="auto";
        this.imgs[i][j].addEventListener("click",function(i,j){
          this.image.src=event.target.src;
          this.background.style.display="block";
          this.background.style.animationDuration="0.5s";
          this.background.style.animationDelay="0.0s";
          this.background.style.animationFillMode="both";
          this.background.style.animationName="mamImageViewerFadeIn";
          this.nowi=i;
          this.nowj=j;
          this.mamImageViewerShowImage(event);
        }.bind(this,i,j));
      }
    }
    window.addEventListener("resize",this.mamImageViewerWinResize.bind(this));
  }


  mamImageViewerClose(e){
    this.background.style.animationName="mamImageViewerFadeOut";
    this.background.style.animationDuration="0.5s";
    this.background.style.animationDelay="0.0s";
    this.background.style.animationFillMode="both";
    setTimeout(function(obj){
      obj.style.display="none";
      obj.style.animationName=null;
    },300,this.background);
  }

  mamImageViewerShowImage(e){
    this.image.src=this.imgs[this.nowi][this.nowj].src;
    if(this.nowj==0){
      this.mamLeftA.style.display="none";
    }else{
      this.mamLeftA.style.display="block";
    }
    if(this.nowj<this.imgs[this.nowi].length-1){
      this.mamRightA.style.display="block";
    }else{
      this.mamRightA.style.display="none";
    }
    this.title.innerHTML=
      "<span style='font-size:20pt;'>"+this.imgs[this.nowi][this.nowj].alt+
      "</span><br><span style='font-size:14pt;'>"+this.imgs[this.nowi][this.nowj].title+"</span>";
  }

  mamImageViewerWinResize(e){
    if(this.image.hasAttribute("src")){
      let nw=this.image.naturalWidth;
      let nh=this.image.naturalHeight;
      let iw=window.innerWidth;
      let ih=window.innerHeight;
      let ww,hh;
      if(nw/nh>iw/ih){
        ww=iw*0.8;
        hh=ww*nh/nw;
      }else{
        hh=ih*0.8;
        ww=hh*nw/nh;
      }
      this.image.style.width=ww+"px";
      this.image.style.height=hh+"px";
    }
  }
}

window.addEventListener('DOMContentLoaded',function(e){
  MamImageViewer=new TMamImageViewer();
});


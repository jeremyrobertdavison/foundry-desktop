const ID = 'foundry-desktop';
const SOCKET = `module.${ID}`;
const DATA_NAME = 'Foundry Desktop — Private Computer Database';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const BaseApp = HandlebarsApplicationMixin(ApplicationV2);

const uuid = () => foundry.utils.randomID();
const clone = value => foundry.utils.deepClone(value);
const safe = value => String(value ?? '');
const cleanURL = value => { const u = safe(value).trim(); return /^(https?:|data:|javascript:)/i.test(u) || /[\"'()<>\n\r]/.test(u) ? '' : u; };
const apps = [
  {id:'explorer', label:'File Explorer', icon:'fa-solid fa-folder-open'},
  {id:'mail', label:'Mail', icon:'fa-solid fa-envelope'},
  {id:'browser', label:'Browser', icon:'fa-solid fa-globe'},
  {id:'search', label:'Search', icon:'fa-solid fa-magnifying-glass'},
  {id:'trash', label:'Recycle Bin', icon:'fa-solid fa-trash-can'},
];
function starter() {
  const root=uuid(), docs=uuid(), readme=uuid(), mail=uuid(), page=uuid();
  return {id:uuid(),name:'New Computer',hostname:'DESKTOP-01',username:'Guest',avatar:'',wallpaper:'',wallpaperMode:'cover',background:'#153047',enabledApps:['explorer','mail','browser','search','trash'],
    items:[
      {id:root,parent:null,type:'folder',name:'Documents',content:'',path:'',password:'',hidden:false,deleted:false},
      {id:docs,parent:root,type:'folder',name:'Research',content:'',path:'',password:'',hidden:false,deleted:false},
      {id:readme,parent:docs,type:'text',name:'Welcome.txt',content:'Welcome to this computer. The GM can edit or remove this sample file.',path:'',password:'',hidden:false,deleted:false},
      {id:mail,parent:null,type:'email',name:'Welcome message',content:'You have mail. Add your own story clues here.',sender:'System',recipient:'Guest',subject:'Welcome',path:'',password:'',hidden:false,deleted:false},
      {id:page,parent:null,type:'web',name:'Company Intranet',content:'<h2>Company Intranet</h2><p>This is an example fictional page.</p>',address:'intranet.local',path:'',password:'',hidden:false,deleted:false}
    ],state:{read:[],unlocked:[],discovered:[]}};
}

// Data is deliberately stored on a GM-only JournalEntry instead of a world setting.
// World settings sync to players and would disclose hidden clue text.
async function dbDoc(create=false){
  let doc=game.journal?.find(j=>j.getFlag(ID,'database')===true);
  if (!doc && create && game.user.isGM) doc=await JournalEntry.create({name:DATA_NAME,ownership:{default:0},flags:{[ID]:{database:true,computers:[]}}},{renderSheet:false});
  return doc;
}
async function allComputers(){if(!game.user.isGM) return []; const d=await dbDoc();return clone(d?.getFlag(ID,'computers')??[]);}
async function saveAll(computers){if(!game.user.isGM) throw Error('GM only');const d=await dbDoc(true);await d.setFlag(ID,'computers',computers);}
async function saveComputer(c){const all=await allComputers();const i=all.findIndex(x=>x.id===c.id);if(i<0)all.push(c);else all[i]=c;await saveAll(all);}
const online=new Map(); // GM-authorized sessions, maintained only on GM client
const viewers=new Map(); // player client desktop instances
const notify=(message)=>ui.notifications?.info(message);
function send(type,payload={},to=null){game.socket.emit(SOCKET,{type,payload,to,from:game.user.id});}
function activeUsers(){return game.users.filter(u=>u.active && !u.isGM);}
function snapshot(c){
  // Redact unpublished clues and all password values before sending data to a player.
  const out=clone(c);
  const original=out.items;
  function accessible(i,trail=new Set()){
    if(trail.has(i.id))return false;
    if(i.hidden && !out.state.discovered.includes(i.id))return false;
    if(!i.parent)return true;
    const parent=original.find(x=>x.id===i.parent);
    if(!parent || parent.deleted || (parent.password && !out.state.unlocked.includes(parent.id)))return false;
    return accessible(parent,new Set([...trail,i.id]));
  }
  out.items=original.filter(i=>accessible(i));
  out.items=out.items.map(i=>{
    const locked=!!(i.password&&!out.state.unlocked.includes(i.id));
    return {...i,password:undefined,locked,content:locked?'':i.content,path:locked?'':i.path,
      sender:locked?'':i.sender,recipient:locked?'':i.recipient,subject:locked?'':i.subject,
      address:locked?'':i.address};
  });
  return out;
}
function announce(c){
  const allowed=online.get(c.id);
  if(!allowed)return;
  for(const uid of allowed){send('snapshot',{computer:snapshot(c)},uid);}
}
async function dispatch(message){
  if(!message || !message.type || message.from===game.user.id)return;
  if(message.to && message.to!==game.user.id)return;
  if(game.user.isGM){
    if(message.type!=='request')return;
    const user=game.users.get(message.from);
    if(!user?.active)return;
    const {id,action,itemId,password}=message.payload??{};
    if(!online.get(id)?.has(user.id))return;
    let c=(await allComputers()).find(x=>x.id===id);if(!c)return;
    const item=c.items.find(x=>x.id===itemId);
    if(!['open','unlock','restore'].includes(action) || !item)return;
    if(action==='restore'){if(!item.deleted)return;item.deleted=false;}
    if(action==='unlock'){
      if(!item.password || c.state.unlocked.includes(item.id) || safe(password)!==item.password){send('denied',{id,itemId},user.id);return;}
      c.state.unlocked.push(item.id);
    }
    if(action==='open'){
      if(item.password && !c.state.unlocked.includes(item.id)){send('locked',{id,itemId},user.id);return;}
      if(!c.state.read.includes(item.id))c.state.read.push(item.id);
      if(!c.state.discovered.includes(item.id))c.state.discovered.push(item.id);
    }
    await saveComputer(c);
    announce(c);
    ui.notifications?.info(`${user.name}: ${action} — ${item.name}`);
  } else {
    if(message.from!==game.users?.find(u=>u.isGM && u.active)?.id && !game.users.get(message.from)?.isGM)return;
    if(message.type==='snapshot'){
      const c=message.payload?.computer;if(!c?.id)return;
      let app=viewers.get(c.id);
      if(!app){app=new Desktop(c,false);viewers.set(c.id,app);}else app.computer=c;
      await app.render(true);
    }else if(message.type==='revoke'){
      const app=viewers.get(message.payload.id);if(app){await app.close();viewers.delete(message.payload.id);}
    }else if(message.type==='locked')ui.notifications?.warn('That item requires a password.');
    else if(message.type==='denied')ui.notifications?.warn('Incorrect password.');
  }
}

class Manager extends BaseApp {
  static DEFAULT_OPTIONS={id:'fd-manager',classes:['foundry-desktop','fd-manager'],position:{width:640,height:610},window:{title:'Computer Library',resizable:true},actions:{new:Manager.newComputer,edit:Manager.editComputer,preview:Manager.preview,share:Manager.share,duplicate:Manager.duplicate,remove:Manager.remove,export:Manager.exportOne,import:Manager.importOne}};
  static PARTS={main:{template:'modules/foundry-desktop/templates/manager.hbs'}};
  async _prepareContext(){return {computers:await allComputers(),users:activeUsers().map(u=>({id:u.id,name:u.name}))};}
  static async newComputer(){new Editor(starter()).render(true);}
  static async editComputer(e,b){const c=(await allComputers()).find(c=>c.id===b.dataset.id);if(c)new Editor(c).render(true);}
  static async preview(e,b){const c=(await allComputers()).find(c=>c.id===b.dataset.id);if(c)new Desktop(c,true).render(true);}
  static async share(e,b){const id=b.dataset.id, uid=b.closest('.fd-computer')?.querySelector('select')?.value;if(!uid)return ui.notifications.warn('Select an online player first.');const c=(await allComputers()).find(c=>c.id===id);if(!c)return; if(!online.has(id))online.set(id,new Set());online.get(id).add(uid);send('snapshot',{computer:snapshot(c)},uid);notify('Computer access granted. Player will receive the desktop.');}
  static async duplicate(e,b){const c=(await allComputers()).find(c=>c.id===b.dataset.id);if(!c)return;const d=clone(c);d.id=uuid();d.name+=' (Copy)';d.state={read:[],unlocked:[],discovered:[]};await saveComputer(d);this.render();}
  static async remove(e,b){if(!confirm('Delete this computer permanently?'))return;const all=(await allComputers()).filter(c=>c.id!==b.dataset.id);online.delete(b.dataset.id);await saveAll(all);this.render();}
  static exportOne(e,b){allComputers().then(all=>{const c=all.find(c=>c.id===b.dataset.id);if(!c)return;const blob=new Blob([JSON.stringify({format:'foundry-desktop',version:1,computer:c},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${c.hostname||'computer'}.foundrydesktop.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
  static async importOne(){const picker=document.createElement('input');picker.type='file';picker.accept='.json';picker.onchange=async()=>{try{const data=JSON.parse(await picker.files[0].text());if(data.format!=='foundry-desktop'||!data.computer?.items||!Array.isArray(data.computer.items))throw Error('Invalid computer export');const c=clone(data.computer);c.id=uuid();c.name=safe(c.name).slice(0,100);c.state={read:[],unlocked:[],discovered:[]};c.items=c.items.map(i=>({...i,id:safe(i.id),name:safe(i.name),content:safe(i.content)}));await saveComputer(c);this.render();}catch(err){ui.notifications.error(`Import failed: ${err.message}`);}};picker.click();}
}

class Editor extends BaseApp {
  constructor(computer){super();this.computer=clone(computer);this.selected=null;}
  static DEFAULT_OPTIONS={classes:['foundry-desktop','fd-editor'],position:{width:830,height:740},window:{title:'Computer Builder',resizable:true},actions:{save:Editor.save,add:Editor.add,edit:Editor.select,delete:Editor.delete,wallpaper:Editor.pickWallpaper,avatar:Editor.pickAvatar,reset:Editor.reset}};
  static PARTS={main:{template:'modules/foundry-desktop/templates/editor.hbs'}};
  async _prepareContext(){const c=this.computer;return {computer:c,items:c.items.map(i=>({...i,indent:i.parent?'↳ ':''})),selected:c.items.find(i=>i.id===this.selected)||null,types:['folder','text','image','audio','video','email','web','shortcut','spreadsheet'],modes:['cover','contain','stretch','center','repeat'],availableApps:apps.map(a=>({...a,checked:c.enabledApps.includes(a.id)}))};}
  readFields(){const root=this.element;const get=(name)=>root.querySelector(`[name="${name}"]`);if(!root)return;
    for(const name of ['name','hostname','username','wallpaper','avatar','background','wallpaperMode'])if(get(name))this.computer[name]=get(name).value;
    this.computer.enabledApps=apps.filter(a=>get(`app-${a.id}`)?.checked).map(a=>a.id);
    const it=this.computer.items.find(x=>x.id===this.selected);if(it){for(const name of ['item-name','item-type','item-parent','item-content','item-path','item-password','item-sender','item-recipient','item-subject','item-address']){const el=get(name);if(el){const k=name.replace('item-','');it[k]=(k==='parent' ? (el.value||null) : el.value);}}for(const name of ['hidden','deleted'])it[name]=!!get('item-'+name)?.checked;if(it.parent===it.id)it.parent=null;}
  }
  static async save(){this.readFields();this.computer.wallpaper=cleanURL(this.computer.wallpaper);this.computer.avatar=cleanURL(this.computer.avatar);this.computer.background=/^#[\da-f]{6}$/i.test(this.computer.background)?this.computer.background:'#153047';await saveComputer(this.computer);notify('Computer saved.');this.render();}
  static add(){this.readFields();const i={id:uuid(),name:'New Document',type:'text',parent:null,content:'',path:'',password:'',hidden:false,deleted:false};this.computer.items.push(i);this.selected=i.id;this.render();}
  static select(e,b){this.readFields();this.selected=b.dataset.id;this.render();}
  static delete(){this.readFields();if(!this.selected)return;const remove=new Set([this.selected]);let progress=true;while(progress){progress=false;for(const it of this.computer.items){if(it.parent && remove.has(it.parent)&&!remove.has(it.id)){remove.add(it.id);progress=true;}}}this.computer.items=this.computer.items.filter(i=>!remove.has(i.id));this.selected=null;this.render();}
  static reset(){this.readFields();this.computer.state={read:[],unlocked:[],discovered:[]};this.render();notify('Discovery state reset in editor. Save to persist.');}
  static async pickWallpaper(){this.readFields();await this.pickFile('wallpaper','image');}
  static async pickAvatar(){this.readFields();await this.pickFile('avatar','image');}
  async pickFile(field,type='image'){
    const Picker=foundry.applications.apps.FilePicker;
    const picker=new Picker({type,current:this.computer[field]||'',callback:(path)=>{this.computer[field]=path;this.render();}});
    await picker.render(true);
  }
}

class Desktop extends BaseApp {
  constructor(computer,isGM){super();this.computer=clone(computer);this.isGM=isGM;this.start=false;this.folder=null;this.panel=null;this.search='';this.address='';this.selected=null;this.settings=false;}
  static DEFAULT_OPTIONS={classes:['foundry-desktop','fd-desktop'],position:{width:1050,height:710},window:{title:'Virtual Desktop',resizable:true},actions:{start:Desktop.toggleStart,launch:Desktop.launch,folder:Desktop.openFolder,up:Desktop.up,open:Desktop.openItem,back:Desktop.back,search:Desktop.searchNow,site:Desktop.goSite,unlock:Desktop.unlock,restore:Desktop.restore,closepanel:Desktop.closePanel,logout:Desktop.logout}};
  static PARTS={main:{template:'modules/foundry-desktop/templates/desktop.hbs'}};
  get title(){return `${this.computer.hostname} — ${this.computer.username}`;}
  get items(){return this.computer.items??[];}
  visible(item){return !item.hidden || this.computer.state.discovered.includes(item.id);}
  async _prepareContext(){const c=this.computer;
    const desktop=this.items.filter(i=>i.parent==null && !['email','web'].includes(i.type) && !i.deleted && this.visible(i));
    const folderItems=this.items.filter(i=>i.parent===this.folder && !i.deleted && this.visible(i) && !['email','web'].includes(i.type));
    let result=[];
    if(this.panel==='search') {const needle=this.search.toLowerCase().trim();result=needle?this.items.filter(i=>!i.deleted&&this.visible(i)&&[i.name,i.content,i.subject,i.sender].some(v=>safe(v).toLowerCase().includes(needle))):[];}
    if(this.panel==='mail')result=this.items.filter(i=>i.type==='email'&&!i.deleted&&this.visible(i));
    if(this.panel==='trash')result=this.items.filter(i=>i.deleted&&this.visible(i));
    const chosen=this.items.find(i=>i.id===this.selected);
    return {c,wallpaper:cleanURL(c.wallpaper),avatar:cleanURL(c.avatar),wallpaperCSS: ({cover:'cover',contain:'contain',stretch:'100% 100%',center:'auto',repeat:'auto'}[c.wallpaperMode]||'cover'),wallpaperRepeat:c.wallpaperMode==='repeat'?'repeat':'no-repeat',desktop:desktop.map(i=>this.decorate(i)),listing:folderItems.map(i=>this.decorate(i)),result:result.map(i=>this.decorate(i)),selected:chosen?this.decorate(chosen):null,folderName:this.folder?this.items.find(i=>i.id===this.folder)?.name:'This PC',panel:this.panel,start:this.start,appMenu:apps.filter(a=>c.enabledApps.includes(a.id)),site:this.address,search:this.search,locked:!!(chosen?.locked||(chosen?.password&&!c.state.unlocked.includes(chosen?.id))),time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),canRestore:!!(chosen?.deleted&&this.isGM),isGM:this.isGM};
  }
  decorate(i){return {...i,icon:({folder:'fa-folder',text:'fa-file-lines',image:'fa-image',audio:'fa-music',video:'fa-film',email:'fa-envelope',web:'fa-globe',shortcut:'fa-link',spreadsheet:'fa-table'})[i.type]||'fa-file',read:this.computer.state.read.includes(i.id),locked:!!(i.locked||(i.password&&!this.computer.state.unlocked.includes(i.id))),path:cleanURL(i.path)};}
  static toggleStart(){this.start=!this.start;this.render();}
  static launch(e,b){this.start=false;this.panel=b.dataset.app;this.selected=null;if(this.panel==='explorer')this.folder=null;this.render();}
  static openFolder(e,b){this.folder=b.dataset.id||null;this.panel='explorer';this.selected=null;this.start=false;this.render();}
  static up(){if(this.folder)this.folder=this.items.find(i=>i.id===this.folder)?.parent||null;this.selected=null;this.render();}
  static back(){this.selected=null;this.render();}
  static async openItem(e,b){const item=this.items.find(i=>i.id===b.dataset.id);if(!item)return;if(item.type==='folder'){this.folder=item.id;this.panel='explorer';this.selected=null;this.render();return;}this.selected=item.id;this.start=false;this.address=item.type==='web'?item.address||item.name:this.address;
    if(item.locked||(item.password&&!this.computer.state.unlocked.includes(item.id))){this.render();return;}
    await this.request('open',item.id);this.render();}
  async request(action,itemId,password=''){
    if(!this.isGM){send('request',{id:this.computer.id,action,itemId,password});return;}
    const c=this.computer,i=c.items.find(i=>i.id===itemId);if(!i)return;
    if(action==='unlock'){if(password!==i.password){ui.notifications.warn('Incorrect password');return;}if(!c.state.unlocked.includes(itemId))c.state.unlocked.push(itemId);}
    if(action==='open'){if(i.password&&!c.state.unlocked.includes(itemId))return;if(!c.state.read.includes(itemId))c.state.read.push(itemId);if(!c.state.discovered.includes(itemId))c.state.discovered.push(itemId);}
    if(action==='restore')i.deleted=false;
    await saveComputer(c);announce(c);this.render();
  }
  static async unlock(){const password=this.element.querySelector('[name="password"]')?.value||'';if(!this.selected)return;await this.request('unlock',this.selected,password);if(!this.isGM)notify('Password submitted.');}
  static async restore(){if(this.selected)await this.request('restore',this.selected);}
  static searchNow(){this.search=this.element.querySelector('[name="search"]')?.value||'';this.panel='search';this.selected=null;this.render();}
  static goSite(){const address=this.element.querySelector('[name="address"]')?.value?.trim().replace(/^https?:\/\//i,'')||'';this.address=address;const page=this.items.find(i=>i.type==='web'&&safe(i.address).toLowerCase()===address.toLowerCase()&&!i.deleted);this.selected=page?.id||null;this.panel='browser';if(page)this.request('open',page.id);this.render();}
  static closePanel(){this.panel=null;this.selected=null;this.render();}
  static logout(){this.close();}
  async close(options){if(!this.isGM)viewers.delete(this.computer.id);return super.close(options);}
}

Hooks.once('init',()=>{
  game.settings.register(ID,'openLibrary',{name:'Open Computer Library',hint:'GM-only launch button is also available in Scene Controls.',scope:'world',config:false,type:Boolean,default:false});
  game.keybindings.register(ID,'library',{name:'Open Computer Library',hint:'GM only',editable:[{key:'KeyD',modifiers:['CONTROL','SHIFT']}],onDown:()=>{if(game.user.isGM){new Manager().render(true);return true;}return false;}});
});
Hooks.once('ready',()=>{
  game.socket.on(SOCKET,(data)=>{dispatch(data).catch(err=>console.error('Foundry Desktop socket:',err));});
  game.modules.get(ID).api={openLibrary:()=>{if(!game.user.isGM)throw Error('GM only');return new Manager().render(true);},openComputer:async id=>{if(!game.user.isGM)throw Error('GM only');const c=(await allComputers()).find(c=>c.id===id);if(c)return new Desktop(c,true).render(true);}};
  if(game.user.isGM){
    const button=document.createElement('button');button.type='button';button.className='fd-launch-button';button.title='Open Foundry Desktop Computer Library';button.innerHTML='<i class="fa-solid fa-desktop"></i> Computers';button.addEventListener('click',()=>new Manager().render(true));
    const place=()=>{const tray=document.querySelector('#settings .settings-sidebar, #settings .tab-body, #settings')||document.querySelector('#sidebar');if(tray&&!tray.querySelector('.fd-launch-button'))tray.append(button);};
    Hooks.on('renderSettings',place);setTimeout(place,700);
  }
});

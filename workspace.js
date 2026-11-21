import {iso,addDays,nights} from './hotel.mjs';
import {TYPES,CHANNELS_EXTERNAL,fresh,hydrate,availableCount,allTypeRooms,getRule,rateFor,quoteStay,reserve,changeStatus,bulkRule,blockRoom,unblock,channelMap,feedRows,toCSV,importPreview,sampleCSV,availableCandidateIds} from './workspace-core.mjs';

const STORE='homa.workspace.v2';
const OLD='homa.hospitality.demo.v1';
const now=iso(new Date());
let state;
try {
  const raw=localStorage.getItem(STORE) || localStorage.getItem(OLD);
  state=hydrate(raw?JSON.parse(raw):null,now);
}catch(e){state=fresh(now);}
const ui={view:'inventory',start:now,days:12,modal:null,channel:'Booking.com',search:'',filter:'All',notice:'',preview:null};
const root=document.getElementById('root');
const money=(n)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:0}).format(Number(n)||0)+' DA';
const fmt=(d)=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const weekday=(d)=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(text,action,attrs='',cls='button')=>'<button type="button" class="'+cls+'" data-action="'+action+'" '+attrs+'>'+text+'</button>';
const ic=(name,size=18)=>{
  const paths={
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    bed:'<path d="M3 19V8m18 11V8M3 16h18M5 13V9h14v4M7 9V6h10v3"/>',
    tag:'<path d="M20 13 12 21 3 12V3h9z"/><circle cx="7.5" cy="7.5" r="1"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
    left:'<path d="m15 18-6-6 6-6"/>',
    right:'<path d="m9 18 6-6-6-6"/>',
    add:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 5 5"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    export:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    check:'<path d="m5 12 4 4 10-10"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
    hotel:'<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h6M10 22v-4h4v4"/>',
    log:'<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
    alert:'<path d="m12 2 10 18H2zM12 9v5M12 17h.01"/>'
  };
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';
};
const navs=[['overview','grid','Overview'],['inventory','layers','Availability & rates'],['calendar','cal','Room calendar'],['reservations','bed','Reservations'],['distribution','globe','Distribution'],['operations','log','Operations']];
const room=(id)=>state.rooms.find(r=>r.id===id);
function save(next,message='Saved'){
  state=next;
  try {localStorage.setItem(STORE,JSON.stringify(state));ui.notice=message;}
  catch(e){ui.notice='Browser storage is unavailable. Export a backup before leaving.';}
  render();
}
function alertUser(message){ui.notice=message;render();}
function setView(v){ui.view=v;ui.modal=null;ui.preview=null;ui.notice='';render();}
function download(name,contents,type='text/plain'){
  const file=new Blob([contents],{type});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function head(title,sub,actions=''){
  return '<header class="view-title"><div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div><div class="view-actions">'+actions+'</div></header>';
}
const primary=(text,action,extra='')=>button(ic('add',16)+esc(text),action,extra,'button button-primary');
function shell(){
  return '<div class="shell">'+
  '<aside class="sidebar"><a href="/app" class="brand" data-nav="inventory"><span class="brand-mark">H</span><span>homa<span class="brand-period">.</span></span></a>'+
  '<div class="property-switch"><div class="property-initial">MO</div><div class="property-name"><strong>'+esc(state.hotelName)+'</strong><small>'+esc(state.location)+'</small></div>'+ic('down',15)+'</div>'+
  '<span class="side-heading">WORKSPACE</span><nav class="nav-list">'+navs.map(n=>'<button type="button" class="nav-link '+(ui.view===n[0]?'active':'')+'" data-nav="'+n[0]+'">'+ic(n[1],17)+'<span>'+esc(n[2])+'</span></button>').join('')+'</nav>'+
  '<div class="side-bottom"><div class="local-status"><span class="tiny-square"></span>Local workspace</div><p>Data is stored in this browser. OTA accounts are not connected.</p></div></aside>'+
  '<div class="main"><div class="topbar"><div class="topbar-path">'+ic('hotel',17)+'<span>'+esc(state.hotelName)+'</span><span class="path-separator">/</span><strong>'+esc(navs.find(n=>n[0]===ui.view)?.[2]||'Workspace')+'</strong></div><div class="topbar-right"><span class="today-text">'+fmt(now)+' '+now.slice(0,4)+'</span>'+button(ic('add',16)+' New reservation','new-booking','','button button-primary button-small')+'</div></div>'+
  '<main class="main-inner">'+(ui.notice?'<div class="notice" role="status">'+ic('info',16)+esc(ui.notice)+button(ic('close',14),'clear-notice','aria-label="Dismiss"','plain-icon')+'</div>':'')+renderView()+'</main></div></div>'+renderModal();
}
function dateBar(){
  return '<div class="range-navigation"><div class="range-caption">'+fmt(ui.start)+' – '+fmt(addDays(ui.start,ui.days-1))+'</div>'+
    button(ic('left',16),'date-prev','aria-label="Previous two weeks"','square-button')+
    button('Today','date-today','','button button-subtle')+
    button(ic('right',16),'date-next','aria-label="Next two weeks"','square-button')+'</div>';
}
function renderView(){
  switch(ui.view){
    case 'overview':return overview();
    case 'calendar':return calendar();
    case 'reservations':return reservations();
    case 'distribution':return distribution();
    case 'operations':return operations();
    default:return inventory();
  }
}
function overview(){
  const total=state.rooms.filter(r=>r.status!=='Maintenance').length;
  const occupied=state.bookings.filter(b=>b.status!=='Cancelled'&&b.checkIn<=now&&now<b.checkOut).length;
  const arr=state.bookings.filter(b=>b.status==='Confirmed'&&b.checkIn===now);
  const dep=state.bookings.filter(b=>b.status==='Checked in'&&b.checkOut===now);
  const coming=state.bookings.filter(b=>b.status==='Confirmed'&&b.checkIn>=now).sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).slice(0,6);
  const external=state.bookings.filter(b=>b.status!=='Cancelled'&&CHANNELS_EXTERNAL.includes(b.channel)).length;
  return head('Today at '+state.hotelName,'The bookings and inventory decisions that need attention.',primary('New reservation','new-booking'))+
  '<div class="metrics">'+
  '<div class="metric"><span>Occupied tonight</span><strong>'+occupied+' <i>/ '+total+'</i></strong><small>'+Math.round(occupied/Math.max(total,1)*100)+'% occupancy</small></div>'+
  '<div class="metric"><span>Expected arrivals</span><strong>'+arr.length+'</strong><small>Confirmed for today</small></div>'+
  '<div class="metric"><span>Expected departures</span><strong>'+dep.length+'</strong><small>Scheduled for today</small></div>'+
  '<div class="metric"><span>OTA reservations</span><strong>'+external+'</strong><small>Manually recorded, not synced</small></div></div>'+
  '<div class="split"><section class="surface"><div class="surface-header"><div><h2>Upcoming arrivals</h2><p>Bookings requiring front-desk attention</p></div>'+button('View all '+ic('arrow',15),'go-reservations','','text-action')+'</div>'+
  '<div class="simple-list">'+(coming.length?coming.map(b=>'<div class="arrival-row"><div><strong>'+esc(b.guest)+'</strong><small>'+esc(b.id)+' · Room '+esc(b.roomId)+' · '+esc(b.channel)+'</small></div><span>'+fmt(b.checkIn)+'</span>'+button('Open','edit-booking','data-id="'+esc(b.id)+'"','button button-subtle')+'</div>').join(''):'<p class="empty">No upcoming arrivals.</p>')+'</div></section>'+
  '<section class="surface"><div class="surface-header"><div><h2>Availability next 7 days</h2><p>Remaining rooms by date</p></div>'+button('Open matrix '+ic('arrow',15),'go-inventory','','text-action')+'</div>'+
  '<div class="availability-list">'+Array.from({length:7},(_,i)=>{const d=addDays(now,i),c=TYPES.reduce((sum,t)=>sum+availableCount(state,t,d),0);return '<div><span>'+weekday(d)+' '+fmt(d)+'</span><div class="availability-track"><i style="width:'+(100*c/Math.max(total,1))+'%"></i></div><strong>'+c+' left</strong></div>';}).join('')+'</div></section></div>'+
  '<div class="inline-prompt">'+ic('info',18)+'<div><strong>Distribution isn’t connected to booking websites yet.</strong><p>Use the distribution page to map room types and export a rate and availability sheet. No platform updates happen automatically.</p></div>'+button('Distribution '+ic('arrow',15),'go-distribution','','button button-subtle')+'</div>';
}
function inventory(){
  const dates=Array.from({length:ui.days},(_,i)=>addDays(ui.start,i));
  const row=(label,cls,fn,clickable=true)=>'<tr><th scope="row" class="measure">'+label+'</th>'+dates.map(d=>{
    const val=fn(d);
    const ct=clickable?' data-action="edit-rule" data-type="'+cls.split(':')[0]+'" data-date="'+d+'"':'';
    return '<td><button type="button" class="grid-value '+(val.kind||'')+'"'+ct+' '+(!clickable?'disabled':'')+' aria-label="'+esc(label)+' '+d+'">'+val.label+'</button></td>';
  }).join('')+'</tr>';
  const blocks=TYPES.map(type=>{
    const total=allTypeRooms(state,type);
    const lines=[
      row('Available',type+':available',d=>{const c=availableCount(state,type,d),r=getRule(state,type,d);return {label:r.stopSell?'Closed':String(c),kind:r.stopSell?'sell-closed':c===0?'zero':'count'};}),
      row('Nightly rate',type+':rate',d=>({label:money(rateFor(state,type,d)),kind:'rate'})),
      row('Min. stay',type+':stay',d=>({label:getRule(state,type,d).minStay+' night'+(getRule(state,type,d).minStay>1?'s':''),kind:'restr'})),
      row('Restrictions',type+':restr',d=>{const r=getRule(state,type,d);return {label:[r.cta?'No arrival':'',r.ctd?'No departure':'',r.stopSell?'Stop sell':''].filter(Boolean).join(', ')||'Open',kind:r.cta||r.ctd||r.stopSell?'restriction':'open'};})
    ].join('');
    return '<tbody class="type-block"><tr class="type-heading"><th colspan="'+(ui.days+1)+'"><span>'+esc(type)+'</span><small>'+total+' bookable room'+(total!==1?'s':'')+'</small></th></tr>'+lines+'</tbody>';
  }).join('');
  return head('Availability & rates','Edit daily prices, remaining rooms and stay restrictions from one place.',primary('Bulk update','bulk-rule'))+
    '<section class="surface matrix-surface"><div class="matrix-toolbar"><div><h2>Inventory matrix</h2><p>Click any date cell to edit its room type and restrictions.</p></div>'+dateBar()+'</div>'+
    '<div class="matrix-scroll"><table class="inventory-table"><thead><tr><th class="matrix-first">Room type / metric</th>'+dates.map(d=>'<th class="'+(d===now?'is-today':'')+'"><small>'+weekday(d)+'</small><span>'+fmt(d)+'</span></th>').join('')+'</tr></thead>'+blocks+'</table></div>'+
    '<div class="matrix-footer"><span>Availability = bookable rooms minus existing stays and maintenance blocks.</span><span>Changes are local until a distribution integration is connected.</span></div></section>';
}
function calendar(){
  const dates=Array.from({length:ui.days},(_,i)=>addDays(ui.start,i));
  const rows=state.rooms.map(r=>{
    let previous='';
    const cells=dates.map(d=>{
      const b=state.bookings.find(x=>x.roomId===r.id&&x.status!=='Cancelled'&&x.checkIn<=d&&d<x.checkOut);
      const blocked=state.blocks.find(x=>x.roomId===r.id&&x.start<=d&&d<x.end);
      let inner='';
      if(b){inner='<button class="calendar-cell occupied" data-action="edit-booking" data-id="'+esc(b.id)+'" title="'+esc(b.guest)+' · '+esc(b.id)+'">'+(b.id===previous?'':esc(b.guest.split(' ')[0]))+'</button>';previous=b.id;}
      else if(blocked){inner='<button class="calendar-cell blocked" data-action="unblock" data-id="'+esc(blocked.id)+'" title="'+esc(blocked.reason)+'">Blocked</button>';previous='';}
      else if(r.status==='Maintenance'){inner='<div class="calendar-cell maintenance">Out of service</div>';previous='';}
      else{inner='<button class="calendar-cell empty-cell" data-action="book-day" data-id="'+esc(r.id)+'" data-date="'+d+'" aria-label="Book room '+esc(r.id)+' on '+d+'">+</button>';previous='';}
      return '<td>'+inner+'</td>';
    }).join('');
    return '<tr><th><strong>'+esc(r.id)+'</strong><small>'+esc(r.name)+'</small></th>'+cells+'</tr>';
  }).join('');
  return head('Room calendar','See every stay by room, with maintenance blocks in the same view.',primary('Block room','new-block'))+
    '<section class="surface matrix-surface"><div class="matrix-toolbar"><div><h2>Room allocation</h2><p>Select an empty night to reserve it or an occupied night to edit the stay.</p></div>'+dateBar()+'</div>'+
    '<div class="matrix-scroll"><table class="calendar-table"><thead><tr><th>Room</th>'+dates.map(d=>'<th><small>'+weekday(d)+'</small><span>'+fmt(d)+'</span></th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="calendar-legend"><span><i class="legend-occupied"></i> Reservation</span><span><i class="legend-block"></i> Maintenance block</span><span><i class="legend-free"></i> Available</span></div></section>';
}
function reservations(){
  const query=ui.search.toLowerCase();
  const list=[...state.bookings].filter(b=>(ui.filter==='All'||ui.filter===b.status)&&
      (!query||[b.guest,b.id,b.email,b.channel,b.roomId,b.externalRef].some(x=>String(x||'').toLowerCase().includes(query))))
    .sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
  const options=['All','Confirmed','Checked in','Checked out','Cancelled'].map(v=>'<option '+(v===ui.filter?'selected':'')+'>'+v+'</option>').join('');
  const rows=list.map(b=>{
    const roomName=room(b.roomId)?.name||'';
    const next=b.status==='Confirmed'?button('Check in','check-in','data-id="'+esc(b.id)+'"','text-action'):b.status==='Checked in'?button('Check out','check-out','data-id="'+esc(b.id)+'"','text-action'):'';
    return '<tr><td><div class="cell-main">'+esc(b.guest)+'</div><small>'+esc(b.id)+(b.externalRef?' · '+esc(b.externalRef):'')+'</small></td><td>'+esc(b.roomId)+'<small>'+esc(roomName)+'</small></td>'+
    '<td>'+fmt(b.checkIn)+'<small>'+nights(b.checkIn,b.checkOut)+' nights</small></td><td>'+fmt(b.checkOut)+'</td><td>'+esc(b.channel)+'</td><td><span class="status-text">'+esc(b.status)+'</span></td>'+
    '<td class="right">'+next+button('Edit','edit-booking','data-id="'+esc(b.id)+'"','text-action')+'</td></tr>';
  }).join('');
  return head('Reservations','Search, create, modify and complete guest stays.',primary('New reservation','new-booking')+button(ic('export',16)+' Import CSV','import-csv','','button button-subtle'))+
  '<section class="surface"><div class="table-toolbar"><div><h2>Booking register <span class="muted-count">'+list.length+'</span></h2></div><div class="table-controls"><label class="search-field">'+ic('search',16)+'<input id="booking-search" type="search" placeholder="Search guest, reference or room" value="'+esc(ui.search)+'" /></label><label class="sr-only" for="status-filter">Filter status</label><select id="status-filter">'+options+'</select></div></div>'+
  '<div class="table-scroll"><table class="register"><thead><tr><th>Guest / reference</th><th>Room</th><th>Arrival</th><th>Departure</th><th>Source</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="7" class="empty">No reservations match these filters.</td></tr>')+'</tbody></table></div></section>';
}
function distribution(){
  const rows=TYPES.map(type=>{
    const config=state.mappings[ui.channel+'|'+type]||{remoteId:'',adjustment:0};
    return '<tr><td><strong>'+type+'</strong><small>'+allTypeRooms(state,type)+' rooms in inventory</small></td><td>'+ (config.remoteId?'<span class="mapping-id">'+esc(config.remoteId)+'</span>':'<span class="unmapped">Not mapped</span>')+'</td><td>'+(config.adjustment>=0?'+':'')+config.adjustment+'%</td><td>'+money(Math.round(rateFor(state,type,now)*(1+Number(config.adjustment)/100)))+'</td><td class="right">'+button('Edit mapping','map-channel','data-type="'+type+'"','text-action')+'</td></tr>';
  }).join('');
  const feed=feedRows(state,ui.channel,ui.start,3).slice(0,9);
  const prev=feed.map(x=>'<tr><td>'+esc(x.roomType)+'</td><td>'+fmt(x.date)+'</td><td>'+x.available+'</td><td>'+money(x.rate)+'</td><td>'+x.minStay+'</td><td>'+esc(x.stopSell)+'</td></tr>').join('');
  return head('Distribution','Configure room-type mapping and inspect the export before connecting an OTA.',button(ic('export',16)+' Export 14-day ARI CSV','export-ari','','button button-primary'))+
  '<div class="context-note">'+ic('info',18)+'<div><strong>No OTA API connection is configured.</strong><p>These mappings and ARI exports are local. They do not publish prices or reservations to Booking.com, Airbnb or Expedia.</p></div></div>'+
  '<section class="surface"><div class="table-toolbar"><div><h2>Channel room mapping</h2><p>Assign each internal room type to its corresponding channel rate-plan identifier.</p></div><select id="channel-select" aria-label="Select channel">'+CHANNELS_EXTERNAL.map(c=>'<option '+(c===ui.channel?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
  '<div class="table-scroll"><table class="register"><thead><tr><th>Internal room type</th><th>External plan ID</th><th>Rate adjustment</th><th>Today's channel rate</th><th class="right">Manage</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>'+
  '<section class="surface feed-surface"><div class="surface-header"><div><h2>Availability, rates & restrictions</h2><p>Read-only preview of the data this property can prepare for a future integration.</p></div>'+dateBar()+'</div>'+
  '<div class="table-scroll"><table class="register compact"><thead><tr><th>Room type</th><th>Date</th><th>Available</th><th>Rate</th><th>Min stay</th><th>Stop sell</th></tr></thead><tbody>'+prev+'</tbody></table></div></section>';
}
function operations(){
  const blocks=[...state.blocks].sort((a,b)=>a.start.localeCompare(b.start));
  const rows=blocks.map(b=>'<tr><td>Room '+esc(b.roomId)+'</td><td>'+fmt(b.start)+'</td><td>'+fmt(b.end)+'</td><td>'+esc(b.reason)+'</td><td class="right">'+button('Remove','unblock','data-id="'+esc(b.id)+'"','text-action')+'</td></tr>').join('');
  const activity=state.activity.slice(0,20).map(a=>'<div class="activity-item"><div class="activity-mark"></div><div><strong>'+esc(a.message)+'</strong><small>'+new Date(a.at).toLocaleString('en-GB')+'</small></div></div>').join('');
  return head('Operations','Maintain room availability and keep a record of changes.',primary('Block room','new-block'))+
  '<div class="split"><section class="surface"><div class="surface-header"><div><h2>Maintenance blocks</h2><p>Blocked dates are deducted from room availability.</p></div></div><div class="table-scroll"><table class="register"><thead><tr><th>Room</th><th>From</th><th>Until</th><th>Reason</th><th></th></tr></thead><tbody>'+(rows||'<tr><td class="empty" colspan="5">No temporary blocks. One room is in permanent maintenance.</td></tr>')+'</tbody></table></div></section>'+
  '<section class="surface"><div class="surface-header"><div><h2>Activity history</h2><p>Changes performed in this browser</p></div></div><div class="activity-list">'+(activity||'<p class="empty">No changes yet. Editing rates or bookings will create an activity entry.</p>')+'</div></section></div>'+
  '<section class="surface data-tools"><div><h2>Your data</h2><p>Save or restore local workspace data, or export reservations for spreadsheet review.</p></div><div class="tool-buttons">'+
  button(ic('export',16)+' Back up workspace','export-backup','','button button-subtle')+
  button(ic('export',16)+' Reservations CSV','export-reservations','','button button-subtle')+
  button('Restore JSON backup','restore-backup','','button button-subtle')+
  '<input type="file" id="backup-file" accept=".json,application/json" hidden></div></section>';
}
function selectOptions(list,selected){return list.map(item=>'<option value="'+esc(item.value||item)+'" '+((item.value||item)===selected?'selected':'')+'>'+esc(item.label||item)+'</option>').join('');}
function field(label,name,value='',type='text',extra=''){return '<label class="field"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+' required></label>';}
function selectField(label,name,values,chosen){return '<label class="field"><span>'+label+'</span><select name="'+name+'">'+selectOptions(values,chosen)+'</select></label>';}
function modalShell(title,intro,body){
  return '<div class="modal-backdrop" data-action="close-modal"><section class="dialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="dialog-head"><div><h2>'+esc(title)+'</h2><p>'+esc(intro)+'</p></div>'+button(ic('close',20),'close-modal','aria-label="Close"','plain-icon')+'</div>'+body+'</section></div>';
}
function modalActions(saveText='Save changes',withCancel=true){
  return '<div class="dialog-actions">'+(withCancel?button('Cancel','close-modal','','button button-subtle'):'')+'<button type="submit" class="button button-primary">'+esc(saveText)+'</button></div>';
}
function bookingDialog(){
  const existing=state.bookings.find(b=>b.id===ui.modal.id);
  const b=existing||{guest:'',email:'',roomId:ui.modal.roomId||state.rooms.find(r=>r.status!=='Maintenance')?.id,
    checkIn:ui.modal.date||now,checkOut:addDays(ui.modal.date||now,1),guests:2,channel:'Direct',status:'Confirmed',externalRef:''};
  return modalShell(existing?'Edit reservation':'New reservation','Changes affect inventory immediately in this browser.',
  '<form data-form="booking" class="dialog-form">'+
  '<div class="form-grid">'+field('Guest name','guest',b.guest)+field('Email address','email',b.email,'email','placeholder="name@example.com"')+
  field('Check-in','checkIn',b.checkIn,'date')+field('Check-out','checkOut',b.checkOut,'date')+
  selectField('Room','roomId',state.rooms.map(r=>({value:r.id,label:r.id+' — '+r.name+(r.status==='Maintenance'?' (maintenance)':'')})),b.roomId)+
  field('Guests','guests',b.guests,'number','min="1" max="8" step="1"')+
  selectField('Source','channel',['Direct','Booking.com','Airbnb','Expedia','Walk-in'],b.channel)+
  field('External reference (optional)','externalRef',b.externalRef||'','text','placeholder="OTA booking ID"')+'</div>'+
  (existing?'<div class="edit-summary">Current status: <strong>'+esc(existing.status)+'</strong>'+ (existing.status!=='Cancelled'&&existing.status!=='Checked out'?button('Cancel reservation','cancel-booking','data-id="'+esc(existing.id)+'"','text-danger'):'')+'</div>':'')+
  modalActions(existing?'Update reservation':'Create reservation')+'</form>');
}
function ruleDialog(){
  const m=ui.modal;
  const r=getRule(state,m.type,m.from);
  const val=r.rate==null?'':r.rate;
  return modalShell('Edit availability & rates',m.type+' · Save a single date or apply a date range.',
  '<form class="dialog-form" data-form="rule"><div class="form-grid">'+
  selectField('Room type','type',TYPES,m.type)+field('From','from',m.from,'date')+
  field('To (inclusive)','to',m.to,'date')+field('Nightly rate (DZD)','rate',val,'number','min="0" step="1" placeholder="Use base rate"')+
  field('Minimum stay (nights)','minStay',r.minStay,'number','min="1" max="90"')+'</div>'+
  '<div class="checks"><label><input type="checkbox" name="stopSell" '+(r.stopSell?'checked':'')+'> Stop sell (close room type for sale)</label>'+
  '<label><input type="checkbox" name="cta" '+(r.cta?'checked':'')+'> Closed to arrival</label>'+
  '<label><input type="checkbox" name="ctd" '+(r.ctd?'checked':'')+'> Closed to departure</label></div>'+
  '<p class="form-help">These controls apply to the selected room type and dates. Existing reservations are not cancelled.</p>'+modalActions('Apply changes')+'</form>');
}
function mappingDialog(){
  const m=ui.modal;const old=state.mappings[ui.channel+'|'+m.type]||{remoteId:'',adjustment:0};
  return modalShell('Edit channel mapping',ui.channel+' · '+m.type,
  '<form class="dialog-form" data-form="mapping">'+
  field('External room or rate-plan ID','remoteId',old.remoteId,'text','placeholder="ID from channel extranet"')+
  field('Rate adjustment (%)','adjustment',old.adjustment,'number','min="-99" max="500" step="0.5"')+
  '<p class="form-help">Saving a mapping does not connect an account. Use the identifier provided by your channel and verify it before any future API integration.</p>'+
  modalActions('Save mapping')+'</form>');
}
function blockDialog(){
  return modalShell('Block a room','Use temporary blocks for maintenance and rooms taken out of service.',
  '<form class="dialog-form" data-form="block"><div class="form-grid">'+
  selectField('Room','roomId',state.rooms.map(r=>({value:r.id,label:r.id+' — '+r.name})),state.rooms[0].id)+
  field('Reason','reason','Maintenance')+field('From','start',now,'date')+field('Until (exclusive)','end',addDays(now,1),'date')+'</div>'+
  '<p class="form-help">You cannot block nights that already have confirmed reservations.</p>'+modalActions('Block room')+'</form>');
}
function importDialog(){
  const preview=ui.preview;
  const sample=sampleCSV();
  const summary=preview?'<div class="import-summary"><strong>'+preview.accepted.length+' accepted</strong><span>'+preview.rejected.length+' rejected</span></div>'+
     (preview.rejected.length?'<div class="validation-errors">'+preview.rejected.map(v=>'<div>Row '+v.line+': '+esc(v.guest)+' — '+esc(v.error)+'</div>').join('')+'</div>':'')+
     (preview.accepted.length?button('Commit '+preview.accepted.length+' reservations','commit-import','','button button-primary'):''):'';
  return modalShell('Import reservations from CSV','Checks duplicates, restrictions and room availability before saving.',
    '<div class="dialog-form"><p class="form-help">Required columns: channel, externalRef, guest, checkIn, checkOut, roomType, email, guests. Dates use YYYY-MM-DD.</p>'+
    '<label class="field"><span>CSV content</span><textarea id="csv-import" rows="9" spellcheck="false" placeholder="'+esc(sample)+'">'+esc(ui.modal.csv||'')+'</textarea></label>'+
    '<div class="dialog-actions">'+button('Cancel','close-modal','','button button-subtle')+button('Validate rows','preview-import','','button button-primary')+'</div>'+summary+'</div>');
}
function renderModal(){
  if(!ui.modal)return '';
  switch(ui.modal.kind){
    case 'booking':return bookingDialog();
    case 'rule':return ruleDialog();
    case 'mapping':return mappingDialog();
    case 'block':return blockDialog();
    case 'csv':return importDialog();
    default:return '';
  }
}
function render(){
  document.title='HOMA — '+(navs.find(n=>n[0]===ui.view)?.[2]||'Hotel operations');
  root.innerHTML=shell();
  document.body.classList.toggle('dialog-open',Boolean(ui.modal));
}
function action(name,el) {
  const id=el.dataset.id;
  try{
    switch(name){
      case 'close-modal':ui.modal=null;ui.preview=null;render();break;
      case 'clear-notice':ui.notice='';render();break;
      case 'go-inventory':case 'go-reservations':case 'go-distribution':setView(name.slice(3));break;
      case 'date-prev':ui.start=addDays(ui.start,-ui.days);render();break;
      case 'date-next':ui.start=addDays(ui.start,ui.days);render();break;
      case 'date-today':ui.start=now;render();break;
      case 'new-booking':ui.modal={kind:'booking'};render();break;
      case 'book-day':ui.modal={kind:'booking',roomId:id,date:el.dataset.date};render();break;
      case 'edit-booking':ui.modal={kind:'booking',id};render();break;
      case 'edit-rule':ui.modal={kind:'rule',type:el.dataset.type,from:el.dataset.date,to:el.dataset.date};render();break;
      case 'bulk-rule':ui.modal={kind:'rule',type:'Classic',from:ui.start,to:addDays(ui.start,ui.days-1)};render();break;
      case 'map-channel':ui.modal={kind:'mapping',type:el.dataset.type};render();break;
      case 'new-block':ui.modal={kind:'block'};render();break;
      case 'unblock':if(confirm('Remove this maintenance block?'))save(unblock(state,id),'Maintenance block removed.');break;
      case 'check-in':save(changeStatus(state,id,'Checked in'),'Guest checked in.');break;
      case 'check-out':save(changeStatus(state,id,'Checked out'),'Guest checked out.');break;
      case 'cancel-booking':if(confirm('Cancel reservation '+id+'?')){save(changeStatus(state,id,'Cancelled'),'Reservation cancelled.');ui.modal=null;render();}break;
      case 'import-csv':ui.modal={kind:'csv',csv:''};ui.preview=null;render();break;
      case 'preview-import':{
        const csv=document.getElementById('csv-import').value;ui.modal.csv=csv;
        ui.preview=importPreview(state,csv);render();break;
      }
      case 'commit-import':{
        if(!ui.preview||!ui.preview.accepted.length)throw Error('No valid reservations to import.');
        const updated=ui.preview.staged;const c=ui.preview.accepted.length;
        ui.modal=null;ui.preview=null;save(updated,c+' reservations imported.');break;
      }
      case 'export-ari':download('homa-'+ui.channel.toLowerCase().replace(/\W+/g,'-')+'-ari.csv',toCSV(feedRows(state,ui.channel,ui.start,14)),'text/csv;charset=utf-8');alertUser('Offline ARI CSV exported. No OTA has been updated.');break;
      case 'export-backup':download('homa-backup-'+now+'.json',JSON.stringify(state,null,2),'application/json');alertUser('Workspace backup exported.');break;
      case 'export-reservations':download('homa-reservations-'+now+'.csv',toCSV(state.bookings.map(b=>({id:b.id,guest:b.guest,room:b.roomId,checkIn:b.checkIn,checkOut:b.checkOut,channel:b.channel,status:b.status,externalRef:b.externalRef||'',guests:b.guests,rate:b.rate}))), 'text/csv');break;
      case 'restore-backup':document.getElementById('backup-file').click();break;
    }
  }catch(err){alertUser(err.message||'Something went wrong.');}
}
root.addEventListener('click',e=>{
  const tab=e.target.closest('[data-nav]');
  if(tab){e.preventDefault();setView(tab.dataset.nav);return;}
  const trigger=e.target.closest('[data-action]');
  if(!trigger)return;
  if(trigger.classList.contains('modal-backdrop')&&e.target!==trigger)return;
  if(e.target.closest('.dialog') && trigger.dataset.action==='close-modal' && trigger.classList.contains('modal-backdrop'))return;
  e.preventDefault();action(trigger.dataset.action,trigger);
});
root.addEventListener('change',async e=>{
  if(e.target.id==='status-filter'){ui.filter=e.target.value;render();}
  if(e.target.id==='channel-select'){ui.channel=e.target.value;render();}
  if(e.target.id==='booking-search'){ui.search=e.target.value;render();}
  if(e.target.id==='backup-file'){
    try {const f=e.target.files?.[0];if(!f)return; if(f.size>10*1024*1024)throw Error('Backup exceeds 10 MB.');
      const imported=hydrate(JSON.parse(await f.text()));if(confirm('Replace current local data with this backup?'))save(imported,'Workspace restored.');
    }catch(err){alertUser(err.message||'Could not restore backup.');}
  }
});
root.addEventListener('submit',e=>{
  const form=e.target.closest('[data-form]');if(!form)return;
  e.preventDefault();
  const data=new FormData(form),v=Object.fromEntries(data.entries());
  try {
    if(form.dataset.form==='booking'){
      const id=ui.modal.id;const original=state.bookings.find(b=>b.id===id);
      const item={...original,...v,guests:Number(v.guests),status:original?.status||'Confirmed',externalRef:String(v.externalRef||'').trim(),rate:original?.rate??undefined};
      if(!item.externalRef)delete item.externalRef;
      const result=reserve(state,item,id||null);
      ui.modal=null;save(result,id?'Reservation updated.':'Reservation created.');return;
    }
    if(form.dataset.form==='rule'){
      const item={...v,stopSell:data.has('stopSell'),cta:data.has('cta'),ctd:data.has('ctd')};
      ui.modal=null;save(bulkRule(state,item),'Rate and restrictions updated.');return;
    }
    if(form.dataset.form==='mapping'){
      const result=channelMap(state,ui.channel,ui.modal.type,v.remoteId,v.adjustment);
      ui.modal=null;save(result,'Mapping saved locally.');return;
    }
    if(form.dataset.form==='block'){
      const result=blockRoom(state,v);ui.modal=null;save(result,'Room blocked.');return;
    }
  }catch(err){ui.notice=err.message||'Could not save.';render();}
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.modal){ui.modal=null;render();}});
render();

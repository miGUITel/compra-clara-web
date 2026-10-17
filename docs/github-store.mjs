import { assembleData, validatePrivateState, clone } from './data-model.mjs?v=0.4';
export const REPOSITORY = 'miGUITel/compra-clara-datos';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const SHA = /^[a-f0-9]{40,64}$/i;
const FILES = ['catalogo.json','reglas.json','propuestas.json','estado.json'];
export class GithubError extends Error {
  constructor(code,message){super(message);this.name='GithubError';this.code=code;}
}
export function encodeJson(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
  let binary=''; for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeJson(content) {
  if(typeof content!=='string'||content.length>2000000)throw new Error('Invalid content');
  const binary=atob(content.replace(/\s/g,''));
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
}
function httpError(status,writing) {
  if(writing && [409,422].includes(status))return new GithubError('CONFLICT','GitHub ha rechazado la versión enviada. Conservamos tu borrador: pulsa Revisar GitHub antes de volver a guardar.');
  if(writing && status>=500)return new GithubError('SAVE_UNKNOWN','No se puede confirmar si GitHub recibió el guardado. Conservamos tu borrador y bloqueamos el reenvío. Pulsa Revisar GitHub.');
  const messages={401:'GitHub no acepta el token. Comprueba que siga vigente.',403:'Acceso denegado. Revisa que el token permita Contents en compra-clara-datos o si has alcanzado un límite de GitHub.',404:'No se encuentra el repositorio o sus archivos, o el token no tiene acceso a compra-clara-datos.'};
  return new GithubError(`HTTP_${status}`,messages[status]||`GitHub ha rechazado la operación (HTTP ${status}). El borrador se conserva.`);
}
export class GithubStore {
  #token; #fetch; #timeout;
  constructor({token,fetchImpl=globalThis.fetch,timeoutMs=15000}={}) {
    if(typeof token!=='string'||!token.trim())throw new GithubError('MISSING_TOKEN','Introduce un token de GitHub.');
    this.#token=token.trim();this.#fetch=fetchImpl.bind(globalThis);this.#timeout=timeoutMs;
  }
  dispose(){this.#token='';}
  async #request(path,{method='GET',body}={}) {
    if(!this.#token)throw new GithubError('DISCONNECTED','La conexión está cerrada.');
    const writing=method==='PUT',controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.#timeout);
    try {
      const response=await this.#fetch(API+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.#token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
      if(!response.ok)throw httpError(response.status,writing);
      try{return await response.json();}catch{throw new GithubError(writing?'SAVE_UNKNOWN':'INVALID_RESPONSE',writing?'No se pudo confirmar la respuesta del guardado. Pulsa Revisar GitHub; no se reenviará automáticamente.':'GitHub devolvió una respuesta no válida. Se conserva la lista anterior.');}
    } catch(error) {
      if(error instanceof GithubError)throw error;
      throw new GithubError(writing?'SAVE_UNKNOWN':'NETWORK',writing?'La conexión se interrumpió durante el guardado. No sabemos si llegó. Conservamos el borrador; pulsa Revisar GitHub.':'No se pudo leer GitHub. Comprueba la conexión. Se conserva la lista anterior.');
    } finally{clearTimeout(timer);}
  }
  async #readJson(path,ref) {
    if(!FILES.includes(path)||!SHA.test(ref))throw new GithubError('INVALID_PATH','Destino de lectura no válido.');
    const result=await this.#request(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
    try{
      if(result.type!=='file'||result.path!==path||result.encoding!=='base64'||!SHA.test(result.sha))throw new Error();
      return {value:decodeJson(result.content),sha:result.sha};
    }catch{throw new GithubError('INVALID_DOCUMENT',`No se pudo validar ${path}. Se conserva la lista anterior.`);}
  }
  async readSnapshot() {
    const head=await this.#request('/git/ref/heads/main');
    if(head.object?.type!=='commit'||!SHA.test(head.object?.sha||''))throw new GithubError('INVALID_RESPONSE','No se pudo validar la versión de GitHub.');
    const commit=head.object.sha;
    const [catalog,rules,proposals,state]=await Promise.all(FILES.map(path=>this.#readJson(path,commit)));
    const data=assembleData(catalog.value,rules.value,proposals.value);
    validatePrivateState(state.value,data);
    return {data,state:state.value,sha:state.sha,commit};
  }
  async writeState(state,sha,data) {
    if(!SHA.test(sha||''))throw new GithubError('MISSING_SHA','Falta la versión original de la lista. Pulsa Revisar GitHub.');
    const snapshot=clone(state);validatePrivateState(snapshot,data);
    const result=await this.#request('/contents/estado.json',{method:'PUT',body:{message:'Actualizar lista y correcciones de compra',branch:'main',sha,content:encodeJson(snapshot)}});
    try {
      if(!SHA.test(result.content?.sha||'')||!SHA.test(result.commit?.sha||''))throw new Error();
      const confirmed=await this.#readJson('estado.json',result.commit.sha);
      validatePrivateState(confirmed.value,data);
      if(confirmed.sha!==result.content.sha||JSON.stringify(confirmed.value)!==JSON.stringify(snapshot))throw new Error();
      return {state:confirmed.value,sha:confirmed.sha,commit:result.commit.sha};
    }catch{throw new GithubError('SAVE_UNKNOWN','El envío pudo llegar, pero no se ha podido verificar su contenido. El borrador se conserva; pulsa Revisar GitHub antes de volver a guardar.');}
  }
}

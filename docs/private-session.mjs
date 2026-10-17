import { clone, validatePrivateState } from './data-model.mjs?v=0.3';
import { GithubError } from './github-store.mjs?v=0.3';
export class PrivateSession {
  #store;
  constructor(store){this.#store=store;this.data=null;this.state=null;this.sha=null;this.commit=null;this.dirty=false;this.blocked=false;this.busy=false;}
  async connect(){this.busy=true;try{const snapshot=await this.#store.readSnapshot();this.accept(snapshot);return this;}finally{this.busy=false;}}
  accept(snapshot){validatePrivateState(snapshot.state,snapshot.data);this.data=snapshot.data;this.state=clone(snapshot.state);this.sha=snapshot.sha;this.commit=snapshot.commit;this.dirty=false;this.blocked=false;}
  changed(state){if(this.busy)throw new Error('Hay una operación en curso.');validatePrivateState(state,this.data);this.state=state;this.dirty=true;}
  async save(){
    if(this.busy||this.blocked)throw new GithubError('BLOCKED','Revisa GitHub antes de volver a guardar.');
    if(!this.dirty)return null;
    this.busy=true;
    const snapshot=clone(this.state);snapshot.updatedAt=new Date().toISOString();
    try{
      const confirmed=await this.#store.writeState(snapshot,this.sha,this.data);
      this.state=confirmed.state;this.sha=confirmed.sha;this.commit=confirmed.commit;this.dirty=false;
      return confirmed;
    }catch(error){if(['CONFLICT','SAVE_UNKNOWN','MISSING_SHA'].includes(error.code))this.blocked=true;throw error;}
    finally{this.busy=false;}
  }
  async review(){if(this.busy)throw new Error('Hay una operación en curso.');this.busy=true;try{return await this.#store.readSnapshot();}finally{this.busy=false;}}
  dispose(){this.#store.dispose();this.data=null;this.state=null;this.sha=null;this.commit=null;this.dirty=false;this.blocked=false;}
}

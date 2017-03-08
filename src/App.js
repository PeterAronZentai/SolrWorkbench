import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import fjsonp from 'fetch-jsonp';

const solrParamsTemplate = (params) => ({  params: params || [] })
const solrParamTemplate = (name, value='', enabled=true) => ({name, value, enabled })

const nop = () => {}
const dataSourceTemplate = (name, url, get) => ({name, url, get})

const tesSource = dataSourceTemplate('tesSource',
  'https://www.tes.com/resources/search/?sortBy=relevance2',
  () => Promise.resolve({}))

const searchApiSource =  dataSourceTemplate('searchApiSource',
  'http://service-resource-search.service.staging.tescloud.com/api/search/v4/search?boostProfile=group3&debug=true&q=break+even+graph',
  (url = searchApiSource.url) => fetch(url).then(r => r.json()).then(rs => rs[0]))

const debugQ = '' //`debugQuery=true` //&debug.explain.structured=true

const dataSource =  dataSourceTemplate('dataSource',
  'http://solr6-master.live.tescloud.com:8983/solr/resource-intl/select-manual-boost?q=dinosaur&wt=json',
  (url = dataSource.url) => fjsonp(url, { jsonpCallback: 'json.wrf', timeout: 20000 }).then(r => r.json()))

const state = {
  version: 0,
  solrParams : solrParamsTemplate(),
  explanation: {},
  docs: [],
  responseHeader: {},
  dataSources: [ tesSource, searchApiSource, dataSource],
  searchApiSource: 'http://service-resource-search.service.live.tescloud.com/api/search/v4/search?sortBy=relevance2',
  displayFields: 'title, score, priceCents,purchases, downloads, views, cdays,mdays,ratings,ratingAverage,ratingWeighted',
  subscribers: [],
  sub(subscriber) {
    state.subscribers.push(subscriber)
  },
  dispatch(change, ...args) {
    if (typeof change === 'function') {
      change = change(...args)
    }
    Object.assign(state, change)
    state.version++
    state.subscribers.forEach(s => s(change))
  }
}

function* mapWithIndex(items, fn) {
  let counter = 0;
  for(var i of items) {
    yield fn(i, counter++)
  }
}

function createSolrParamsFromSolrResponse(solrResponse) {
  const responseParams = solrResponse.responseHeader.params
  const solrParams = solrParamsTemplate()

  for(const param in responseParams) {
    solrParams.params.push(solrParamTemplate(param,responseParams[param]))
  }
  return solrParams;
}

function createQueryStringFromSolrParams(solrParams) {
  return solrParams
           .filter( p => p.enabled )
           .filter (p => p.name !== 'json.wrf')
          .map(({name, value}) => [].concat(value).map(v =>`${name}=${v}`).join('&'))
          .join('&');
}


class SolrParam extends Component {

  *solrParamValue() {
    const param = this.props.param
    switch(typeof param.value) {
      case 'object':
        let c = 0;
        for(let s of param.value) {
          yield <textarea className="value" key={c} data-index={c}
                          onChange={(e) => state.dispatch( (index, value) => { param.value[index] = value },
                          e.target.dataset.index, e.target.value)}
                          value={s}></textarea>
          c++;
        }
        break;
      default:
        yield <textarea className="value" key="editor"
                onChange={(e) => state.dispatch(() => { param.value = e.target.value })}
                value={param.value}></textarea>
    }
  }

  render() {
    const param = this.props.param
    const params = state.solrParams.params
    return <div className="solr-param">
      <div className="param-title">
        <input type="checkbox" checked={param.enabled}
          onChange={(e) => state.dispatch((state) => { param.enabled = e.target.checked })} />
        <input className="name" value={param.name}
          onChange={(e) => state.dispatch(() => { param.name = e.target.value })} />
        <button
          onClick={(e) => state.dispatch(() => { params.splice(params.indexOf(param), 1) })}>remove</button>
      </div>
      {[...this.solrParamValue()]}
    </div>
  }
}

export class SolrParams extends Component {

  constructor(...args) {
    super(...args)
  }
  render() {
    const [...items] = mapWithIndex(state.solrParams.params, (p, i) => <SolrParam key={i} param={p} />)
    console.log("render SolrParams")
    console.log(state.solrParams)
    return <div style={{overflow:'auto'}} className="params-list">
     {items}
    </div>
  }
}


const Explanation = ({ data }) => {
  const hasChildren = !!(data.details && data.details.length)
  const isOpen = data.viewerOpen === true
  const showOpen = hasChildren && !isOpen
  const showClose = hasChildren && isOpen
  return <div className="explanation">
    <div className="explain-main">
      {showOpen && <a onClick={() => state.dispatch( () => {data.viewerOpen = true} )}>(+)</a>}
      {showClose && <a onClick={() => state.dispatch( () => {data.viewerOpen = false} )}>(-)</a>}
      <div className="description">{data.description}</div>
      <span className="match-value">{data.value}</span>
    </div>
    {isOpen && data.details.map(i => <Explanation data={i} />)}
  </div>
}

const  DataSource = ({name, url, onChange = nop, onExecute = nop }) => <div className="data-source row">
  <span className="name">{name}</span>
  <input className="value" style={{width:'100%'}} value={ url } onChange={onChange} />
  <button onClick={onExecute}>Run</button>
</div>

console.log(fjsonp);




class App extends Component {

  loadSolrResponse(solrResponse) {
    const solrParams = createSolrParamsFromSolrResponse(solrResponse)
    const docs = solrResponse.response.docs
    const explanation = ((solrResponse.debug || {}).explain || {})
    console.log("@@@SOLR", solrResponse)
    state.dispatch({ solrParams, docs, explanation })
  }


  sortParam() {
    const solrParams = { params:  state.solrParams.params.sort( (i1, i2) => i1.name < i2.name ? -1 : 1) }
    state.dispatch({ solrParams })
    console.log("?")
  }


  saveParams() {
    const name = prompt("name")
    if (name) {
      localStorage.setItem(name, JSON.stringify(state.solrParams))
      alert("params saved!")
    }
  }

  loadParams() {
    const name = prompt("name")
    if (name) {
      const solrParams = JSON.parse(localStorage.getItem(name))
      state.dispatch({ solrParams })
    }
  }

  loadSolrResult(solrResponse) {
    const responseHeader = solrResponse.responseHeader
    const docs = solrResponse.response.docs
    const numFound = solrResponse.response.numFound
    const explanation = ((solrResponse.debug || {}).explain || {})
    state.dispatch({
      displayFields: responseHeader.params.fl.split(',').map(s => (s.split(':'))[0]).join(','),
      responseHeader,
      docs,
      explanation,
      numFound
    })
  }


  handleRun(ds) {
    ds.get(ds.url).then( solr => this.loadSolrResponse(solr))
  }

  loadData() {
    const solrDataSource = state.dataSources[2]
    const q = createQueryStringFromSolrParams(state.solrParams.params) + '&' + debugQ;
    const service = solrDataSource.url.split('?')[0]
    const url = `${service}?${encodeURI(q)}`
    solrDataSource.get(url).then(solr => this.loadSolrResult(solr))
  }

  handleAddNew(e, p) {
    state.dispatch( () => state.solrParams.params.unshift(solrParamTemplate('','')) )
  }
  render() {
    return (
      <div className="App border" id="App" ref="app">
        <div className="params-column">
          <div>
            {state.dataSources.map( ds =>
              <DataSource
                key={ds.name}
                name={ds.name}
                url={ds.url}
                onExecute={ (e) => this.handleRun(ds) }
                onChange={ (e) => { state.dispatch( (ds, value) => {ds.url = value }, ds, e.target.value) }} />) }
          </div>
          <div className="row">
            <button onClick={this.loadData.bind(this)}>Run</button>
            <button onClick={this.handleAddNew}>New param</button>
            <button onClick={this.saveParams}>Save params</button>
            <button onClick={this.loadParams}>Load params</button>
            <button onClick={this.sortParam.bind(this)}>Sort</button>
          </div>
          <SolrParams  version={state.version} />
        </div>
        <div className="result-column border">
          <div>
            <div>QTime:{state.responseHeader.QTime},
            count: {state.numFound}</div>
          </div>
          <div className="col title-filter">
            <input value={state.displayFields}
              onChange={(e) => { state.dispatch((s, v) => {s.displayFields = v}, state, e.target.value)} }  />
          </div>

          <div className="result-list">

                <div className="result-item-fields">
                  { state.displayFields.split(',')
                        .map( f => <div className={f.trim()} key={f.trim()}>{f.trim().replace('deb_','')}</div>) }
                </div>

                { state.docs.map(doc => <div key={doc.id} className="result-item">
                  <div className="result-item-fields">{state.displayFields.split(',').map( f => {
                    let field = <div key={f.trim()}  className={f.trim()}>{doc[f.trim()]}</div>

                    return field;})}</div>
                  {!!(state.explanation[doc.id]) && <Explanation key={'exp'+doc.id} data={state.explanation[doc.id]} /> }
                </div>)}

            </div>

      </div>
    </div>
    );
  }



  componentDidMount() {
    state.sub((change) => {
      console.time("update")
      this.forceUpdate(() => console.timeEnd("update"))
    })
    window.App = this

    this.refs.app.addEventListener("copy", (e) => {
      if ([HTMLTextAreaElement,HTMLInputElement].some( c => e.srcElement instanceof c)) {
        return;
      }
      e.preventDefault()
      e.clipboardData.setData("text/plain", JSON.stringify(state.solrParams.params.filter( i => i.enabled).map( i => [i.name, i.value]), null, 1))
      console.info("Current params saved to clipboard")
    })
  }
}



export default App;

/*How this works-
1. use AnnParser object to extract and format annoation data from vcml Object
2. pass vcml object into main.js through json file
*/

//for manipulating text annos
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

//classes to correctly format annotaiton data
class Name {
  constructor(name) {
    this.name = name
  }
}

class VCMLElement {
  constructor(name, freetext) {
    this.$ = new Name(name);
    this._ = freetext;
  }
}

class Url {
  constructor(name, link = '') {
    this.$ = new Name(name);
    this._ = link;
    this.vcid = name;
  }
}

class ModelWrapper {
  constructor(name, text, urls) {
    this.$ = new Name(name);
    this.math = [];
    this.text = text;
    this.url = urls;
    this.qualifier = '';
    this.literalQualifier = '';
  }
}

class BioModel {
  constructor(biomodel) {
    this.BioModel = biomodel
  }
}

class KeyValContainer {
  constructor(key, val) {
    this.key = key;
    this.val = val;
  }
}

//class to process annotations and urls from vcml
class AnnParser {

  //function to extract text from HTML string
  //credit to https://stackoverflow.com/questions/28899298/extract-the-text-out-of-html-string-using-javascript
  extractContent(s, space=false) {
    const dom = new JSDOM();
    var span= dom.window.document.createElement('span');
    span.innerHTML= s;
    if(space) {
      var children= span.querySelectorAll('*');
      for(var i = 0 ; i < children.length ; i++) {
        if(children[i].textContent)
          children[i].textContent+= ' ';
        else
          children[i].innerText+= ' ';
      }
    }
    return [span.textContent || span.innerText].toString().replace(/ +/g,' ');
  };

  //after extractContent(), remove all leading \n
  removeLeadingNewLines(s) {
    try {
      //strip whitespace from front
      let indexFront = 0;
      let slice = s.slice(indexFront, indexFront + 1);
      while (slice == '\n' || slice == ' ') {
        indexFront += 1;
        slice = s.slice(indexFront, indexFront + 1);
      }
      //strip from back
      let indexBack = s.length - 1;
      slice = s.slice(indexBack - 1, indexBack);
      while (slice == '\n' || slice == ' ') {
        indexBack -= 1;
        slice = s.slice(indexBack - 1, indexBack);
      }
      return (s.slice(indexFront, indexBack));
    } catch (e){
      console.log(e);
      return (s);
    }
  }

  constructor(vcml) {
    this.vcmlObj = vcml;
    this.uriBinds = this.vcmlObj.vcml.BioModel[0].vcmetadata[0].uriBindingList[0].uriBinding;
    this.txtAnnos = this.vcmlObj.vcml.BioModel[0].vcmetadata[0].nonrdfAnnotationList[0].nonrdfAnnotation;
    //lczCpds short for LocalizedCompound
    this.lczCpds = this.vcmlObj.vcml.BioModel[0].Model[0].LocalizedCompound;
    this.annotations = new Object();

    //wrap in try catch for models without annotations
    try {
      //create compound ref to true name mapping for use later
      let compoundRefMap = new Object();
      for (let i = 0; i < this.lczCpds.length; i++) {
        compoundRefMap[this.lczCpds[i].$.CompoundRef] = this.lczCpds[i].$.Name;
      }

      //---uri bindings---
      //retrieve uri bindings
      let urls = new Object;
      for (let i = 0; i < this.uriBinds.length; i++) {
        let thisBind = this.uriBinds[i].$;
        urls[thisBind.uri] = new Url(thisBind.vcid);
      }
      let bindings = this.vcmlObj.vcml.BioModel[0].vcmetadata[0]['rdf:RDF'][0]['rdf:Description'];

      //compare binding in "uriBinding" to that in "rdf" and find matches
      for (let i = 0; i < bindings.length; i ++) {
        let binding = bindings[i]['$']['rdf:about'];
        let thisRDF = bindings[i];
        //get all the keys, which are <rdf:qualifier> elements in vcml
        let RDFkeys = Object.keys(thisRDF);

        for (let i = 0; i < RDFkeys.length; i++) {

          if (binding in urls) {
            let URLObj = urls[binding];
            let vcid = URLObj.vcid;

            //make sure we get keys we want
            if (RDFkeys[i].includes('bqbiol') || RDFkeys[i].includes('bqmodel') || RDFkeys[i].includes('CopasiMT')) {

              //each key mapping can have >1 rdf:bag
              let keyMap = thisRDF[RDFkeys[i]];
              for (let j = 0; j < keyMap.length; j++) {

                //each rdf:Bag obj can have >1 key
                let rdfBag = keyMap[j]['rdf:Bag'][0];
                let bagKeys = Object.keys(rdfBag);
                for (let u = 0; u < bagKeys.length; u++) {
                  if (bagKeys[u].includes('rdf:')) {
                    let thisURI = rdfBag[bagKeys[u]][0]['rdf:Description'][0]['$']['rdf:about'];

                    //push all the next keys as new url objects onto urls
                    //remove unneeded characters from vcid
                    let pIndex = vcid.indexOf('(');
                    let vcidType = vcid.slice(0, pIndex);
                    let strippedVcid = vcid.slice(pIndex + 1, vcid.length - 1);
                    //see if vcid is actually compound ref
                    if (compoundRefMap[strippedVcid] != undefined) {
                      vcid = vcidType + '(' + compoundRefMap[strippedVcid] + ')';
                    }
                    //key must be unique
                    let key = '$' + j.toString() + u.toString() + i.toString() + vcid;
                    //create new object
                    urls[key] = new Url(vcid);
                    //add URI
                    urls[key]._ = thisURI;
                    //format qualifier
                    let qual = RDFkeys[i]
                    urls[key].qualifier = '(' + qual.replace(':', ') ');
                    urls[key].qualifier = urls[key].qualifier.replace('bqbiol', 'bio');
                    urls[key].qualifier = urls[key].qualifier.replace('bqmodel', 'model');
                    //add literal qualifier
                    let colonIndex = qual.indexOf(':') + 1;
                    let literalQualifier = qual.slice(colonIndex, qual.length);
                    urls[key].literalQualifier = literalQualifier;
                  }
                }
              }
            }
          }
        }
      }

      //clean empty url instaces from object
      let urlKeys = Object.keys(urls);
      for (let i = 0; i < urlKeys.length; i++) {
        if (urls[urlKeys[i]]._ == '') {
          delete urls[urlKeys[i]];
        }
      }

      //---text annos---
      //get vcids
      for (let i = 0; i < this.txtAnnos.length; i++) {
        let vcid = this.txtAnnos[i].$.vcid;
        //remove unneeded characters from vcid
        let pIndex = vcid.indexOf('(');
        let vcidType = vcid.slice(0, pIndex);
        let strippedVcid = vcid.slice(pIndex + 1, vcid.length - 1);
        //see if vcid is actually compound ref
        if (compoundRefMap[strippedVcid] != undefined) {
          vcid = vcidType + '(' + compoundRefMap[strippedVcid] + ')';
        }
        try {
          let txtAnno = this.extractContent(this.txtAnnos[i].freetext[0]);
          txtAnno = this.removeLeadingNewLines(txtAnno);
          this.annotations[vcid] = new VCMLElement(vcid, txtAnno);
        } catch{}
      }

      //organize data into JSON file that will be used by main.js
      let values = Object.values(this.annotations);
      this.JSONwrapper = new ModelWrapper('PLACEHOLDER', values, urls);
    } catch {
      this.JSONwrapper = "";
    }
  }

  //returns reformatted output options for easier use on client side
  getOutputOptions() {
    try {
      let outOps = this.vcmlObj.vcml.BioModel[0].SimulationSpec[0].Simulation[0].SolverTaskDescription[0].OutputOptions[0].$;
      let entries = Object.entries(outOps);
      let list = [];
      for (let i = 0; i < entries.length; i++) {
        let e = entries[i];
        let key = e[0];
        let val = e[1];
        list.push(new KeyValContainer(key, val));
      }
      return (list);
    } catch {
      return null;
    }
  }

  //returns json string of annotation object for use in main.js
  getString() {
    return (JSON.stringify(new BioModel(this.JSONwrapper)));
  }

  getName() {
    //get name of model
    let temp = this.vcmlObj.vcml.BioModel[0].$.Name;
    let tempIndex = temp.indexOf('::');
    this.name = temp.slice(tempIndex + 2, temp.length);

    return (this.name);
  }

  getVersionId() {
    this.VersionId = this.vcmlObj.vcml.BioModel[0].Version[0].$.KeyValue;
    return this.VersionId;
  }
}

//export this object to app.js
exports.AnnParser = AnnParser;

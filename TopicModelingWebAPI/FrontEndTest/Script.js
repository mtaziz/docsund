function createNode(element) {
    return document.createElement(element);
}

function append(parent, el) {
    return parent.appendChild(el);
}

test_url = 'http://127.0.0.1:5000';

window.onload = function () {
    var select = document.getElementById("archivesListBox");

    fetch(test_url + '/TM/archives', {
        mode: 'cors',
        method: 'GET'
    })
    .then((resp) => resp.json())
    .then(function (data) {

        var files = data["files"];

        return files.map(function (file) {
            let option = createNode('option');
            option.text = option.value = file;
            select.add(option, 0);
        })
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

enableSelectArchiveBtnFn = function () {
    var select = document.getElementById("archivesListBox");
    var selectArchiveBtn = document.getElementById('selectArchiveBtn');

    selectArchiveBtn.disabled = (select.selectedIndex == -1);
};

selectArchiveFn = function() {
    var select = document.getElementById("archivesListBox");
    var selectedFile = select.options[select.selectedIndex].value;
    var url = test_url + '/TM/archives/';
    url += selectedFile;

    documentType = document.querySelector('input[name="type"]:checked').value;

    var formData = new FormData();
    formData.append('type', documentType);

    fetch(url, {
        mode: 'cors',
        method: 'POST',
        body: formData
    })
    .then(function (resp) {
        if ((resp.status >= 200) && (resp.status < 300)) {
            var createModelBtn = document.getElementById('createModelBtn');
            createModelBtn.disabled = false;
        }
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

var timerId = null;

checkIfModelBuiltFn = function () {
    fetch(test_url + '/TM/ldamodel', {
        mode: 'cors',
        method: 'GET'
    })
    .then((resp) => resp.json())
    .then(function (data) {
        modelBuilt = data['modelBuilt'];

        if (modelBuilt) {
            clearInterval(timerId);

            getNumberOfTopicsBtn.disabled = false;
            getWordCloudBtn.disabled = false;
            getTopicDistributionBtn.disabled = false;
            getDocumentIDsBtn.disabled = false;
        }
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

createModelFn = function () {
    fetch(test_url + '/TM/ldamodel', {
        mode: 'cors',
        method: 'GET'
    })
    .then(function (resp) {
        timerId = setInterval(checkIfModelBuiltFn, 1000);
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

getNumTopicsFn = function () {
    fetch(test_url + '/TM/topics', {
        mode: 'cors',
        method: 'GET'
    })
    .then((resp) => resp.json())
    .then(function (resp) {
        var numTopicsText = document.getElementById('numTopicsText');
        numTopicsText.innerHTML = resp['numberOfTopics'];
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

getWordCloudFn = function () {
    var chosenTopicIDText = document.getElementById('chosenTopicIDText');

    fetch(test_url + '/TM/topics/' + chosenTopicIDText.innerHTML, {
        mode: 'cors',
        method: 'GET'
    })
    .then((resp) => resp.text())
    .then(function (data) {
        var wcImage = document.getElementById('wordCloudImg');
        wcImage.src = "data:image/png;charset=utf-8;base64," + data;
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

getTopicDistributionFn = function () {
    fetch(test_url + '/TM/topicdistribution', {
        mode: 'cors',
        method: 'GET'
    })
    .then((resp) => resp.text())
    .then(function (data) {
        var wcImage = document.getElementById('topicDistributionImg');
        wcImage.src = "data:image/png;charset=utf-8;base64," + data;
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

getDocumentIDsFn = function () {
    var topicIDForDocumentsText = document.getElementById('topicIDForDocumentsText');

    fetch(test_url + '/TM/topics/' + topicIDForDocumentsText.innerHTML + '/documents', {
        mode: 'cors',
        method: 'GET'
    })
    .then((resp) => resp.json())
    .then(function (data) {
        var documentIDsText = document.getElementById('documentIDsText');
        var documentIDArray = data['docIDs'];

        documentIDArray.map(function (docID) {
            documentIDsText.innerHTML += docID;
            documentIDsText.innerHTML += "\n";
        });
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
    });
};

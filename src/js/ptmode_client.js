/*
* semi main in development
*/
import $ from 'jquery'
import './../css/app.css'
import './../css/ptmode.css'
import nanoid from 'nanoid'
import './lib/adapter'
// import {hasWebrtc, getBrowser} from './caniuse'
// import {connect} from 'rsup-mqtt'
import './lib/mqttws31.min'
import { post } from './restapi'

if (['console'] === undefined || console.log === undefined) { console = { log: function () { }, info: function () { }, warn: function () { }, error: function () { } } } else if (!location.href.match(/172.25|localhost|127.0.0|www.mobizen.tv/)) { console.log = console.info = console.warn = console.error = function () { } }

// browser compatibility
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.mediaDevices.getUserMedia
var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription
var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate

var pc = null
var client = null
var localSdp = null
var stream = null

var receiverGuid = ''
var connectGuid = ''
var authcode = ''

var signalServer = {}
var rtcconfig = {}

var peerConnectionOptions = {
  'optional': [{
    'DtlsSrtpKeyAgreement': 'true'
  }]
}

var mediaConstraints = {
  'offerToReceiveAudio': true,
  'offerToReceiveVideo': true
}

function RTC () {
}
RTC.prototype.webrtcSupport = function () {
  return RTCPeerConnection
}

function PTMode () {
  this._$ptmode = $('#ptmode')
  this._$authcode = $('#authCode')
  this._$btnRefresh = $('#btnRefresh')
  this._$ptRoom = $('#ptRoom')

  this._$languageBtn = $('#language-btn')
  this._$languageList = $('#language-list')
  this._$selectLanguage = $('#select-language')

  this._$fullpageNav = $('#fullPage-nav')
  this._$main = $('main.content-wrap')
  this._$scrollBody = $('main.content-wrap')
  this._$webrtcIcon = $('#webrtc-icon')

  var rtc = new RTC()
  /***********************
       * initialize
       */
  this._setEvents()
  rtc.webrtcSupport() && this._$webrtcIcon.addClass('ok')
  this.createAuthcode(nanoid(11))
    .then(() => this.clientConnect())
    .catch((err) => { console.error('message' + err) })
}

PTMode.prototype._setEvents = function () {
  var self = this

  this._$btnRefresh.on('click', function () {
    self.ptDisconnect().then(function () {
      sessionStorage.removeItem('receiverguid')
      pc = undefined
      // close ptmode UI
      self.displayVideo(false)
    })
    self.createAuthcode(nanoid(11))
  })

  this._$ptRoom.find('button').on('click', function (event) {
    switch (event.currentTarget.id) {
      case 'btn-viewer-flip':
      {
        $(event.currentTarget).toggleClass('active')
        $('nav_lst')[$(event.currentTarget).hasClass('active') ? 'show' : 'hide']()
        break
      }
      case 'btn-viewer-draw':
      {
        $(event.currentTarget).toggleClass('active')
        break
      }
      case 'btn-viewer-mic':
      {
        $(event.currentTarget).toggleClass('active')
        break
      }
      case 'btn-viewer-close':
      {
        self._$btnRefresh.trigger('click')
        break
      }
    }
  })

  this._$languageBtn.on('click', function () {
    self._$languageBtn.toggleClass('open')
    self._$languageList[self._$languageBtn.hasClass('open') ? 'show' : 'hide']()
  })

  this._$fullpageNav.find('a').on('click', function (event) {
    self._$fullpageNav.find('a')
      .removeClass('active')
      .filter(event.currentTarget)
      .addClass('active')
  })
}

/***********************
   * Signaling
   */
PTMode.prototype.createAuthcode = function (_guid) {
  var self = this

  return post('receiver/pt_authcode', { receiverguid: _guid }).then(function (res) {
    console.log('%cWEBAPI createAuthcode::', 'color:green', res)
    // UI - display authcode
    self.displayAuthcode(res.authcode)
    // set datas
    sessionStorage.setItem('receiverguid', _guid)
    receiverGuid = _guid
    connectGuid = nanoid(11)
    signalServer = res.signal
    rtcconfig = res.rtcConfig
    authcode = res.authcode
  })
}

PTMode.prototype.clientConnect = function () {
  console.log('clientConnect')

  var self = this
  client = new Paho.MQTT.Client(signalServer.address, Number(signalServer.port), connectGuid)
  client.onMessageArrived = onMessageArrived
  client.onConnectionLost = onConnectionLost

  client.connect({useSSL: true, mqttVersion: 3, onSuccess: onConnect, onFailure: onFailure})

  function onMessageArrived (message) {
    var r = JSON.parse(message.payloadString)
    if (r.mptSessionDescription !== null && r.mptSessionDescription !== undefined) {
      console.log('%cMQTT onMessageArrived::', r, 'color:blue')
      if (r.mptEndpoint.endpointID === receiverGuid) return

      pc.setLocalDescription(localSdp)
      pc.setRemoteDescription(new RTCSessionDescription(r.mptSessionDescription))
        .then(function () {
          console.log('publisher, Remote description accepted!')
        })
        .then(function () {
          console.log('publisher, set RTC session description')
          return self.ptConnect()
        }).catch(function (err) {
          console.log(err + 'error')
        })
    } else if (r.mptIceCandidate !== null && r.mptIceCandidate !== undefined) {
      if (r.mptEndpoint.endpointID === receiverGuid) return

      pc.addIceCandidate(new RTCIceCandidate(r.mptIceCandidate))
    }
  }

  function onConnectionLost (responseObject) {
    if (responseObject.errorCode !== 0) {
      console.log('%cMQTT onConnectionLost::' + connectGuid, 'color:blue')
      console.log(responseObject)
    }
    // relay server connection
    //  self.clientConnect();
    //  console.err or("Client, Reconnecting");
    self.ptDisconnect()
  }

  function onConnect () {
    // Once a connection has been made, make a subscription and send a message.
    console.log('%cMQTT onConnect::' + connectGuid, 'color:blue')
    client.subscribe('MobizenPT/' + connectGuid)
    self.peerConnection()
  }

  function onFailure () {
    console.log('%cMQTT onFailure::' + connectGuid, 'color:blue')
  }

  function willMessage () {
    console.log('%cMQTT willMessage::' + connectGuid, 'color:blue')
  }
}

PTMode.prototype.peerConnection = function () {
  var self = this

  pc = new RTCPeerConnection(rtcconfig, peerConnectionOptions)

  pc.createOffer(mediaConstraints).then(function (offer) {
    localSdp = offer
    console.log('%ccreate offer::' + localSdp, 'color:skyblue')
  }).then(function () {
    // Send the offer to the remote peer using the signaling server
    // console.log('set local des: ' + self.pc.localDescription.type)
    return self.ptStandby()
  }).catch(function (err) {
    console.error('create offer err: ' + err)
  })

  pc.onicecandidate = function (event) {
    if (event.candidate === null) return
    console.log('%conIce::', 'color:skyblue', event.candidate.candidate)

    var candidate = {
      mptEndpoint: {
        endpointID: receiverGuid
      },
      mptIceCandidate: {
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        sdpMid: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      }
    }
    console.log('%cSendCandidate to room::' + connectGuid, 'color:green')

    var message = new Paho.MQTT.Message(JSON.stringify(candidate))
    message.destinationName = 'MobizenPT/' + connectGuid
    client.send(message)
  }

  pc.oniceconnectionstatechange = function (event) {
    console.log('%coniceconnectionstatechange::' + pc.iceConnectionState, 'color:skyblue')

    if (pc.iceConnectionState === 'failed' ||
      pc.iceConnectionState === 'disconnected' ||
      pc.iceConnectionState === 'close') {
      self._$btnRefresh.trigger('click')
    }
  }

  pc.ontrack = function (event) {
    console.log('%contrack::', 'color:skyblue')
    // open video ui
    stream = event.streams[0]
    self.displayVideo(true)
  }
}

PTMode.prototype.ptStandby = function () {
  console.log('%cWEBAPI succeed! standby', 'color:green')

  return post('receiver/pt_standby', {
    receiverguid: receiverGuid,
    authcode: authcode,
    connectguid: connectGuid,
    mptSessionDescription: {
      type: 'offer',
      sdp: localSdp.sdp
    }
  })
}

PTMode.prototype.ptConnect = function () {
  console.log('%cWEBAPI ptConnect', 'color:green')
  return post('receiver/pt_connect', {
    receiverguid: receiverGuid,
    connectguid: connectGuid
  })
}

PTMode.prototype.ptDisconnect = function () {
  console.log('%cWEBAPI ptDisConnect', 'color:green')
  return post('receiver/pt_close', {
    receiverguid: receiverGuid,
    connectguid: connectGuid
  })
}

PTMode.prototype.displayAuthcode = function (_code) {
  this._$ptRoom.hide()
  document.querySelector('video').srcObject = null
  this._$authcode.text(_code.slice(0, 3) + ' ' + _code.slice(3, 6))
}

PTMode.prototype.displayVideo = function (_show) {
  var self = this
  var video = document.querySelector('video')

  function setVideoSize () {
    video.style.width = '100%'
    video.style.height = '100%'
    self._$ptRoom.css('padding-top', (window.clientHeight - video.clientHeight) * 0.5 + 'px')
  }

  if (_show) {
    this._$ptRoom.show()
    video.srcObject = stream
    setVideoSize()
  } else {
    this._$ptRoom.hide()
    video.srcObject = null
  }
  $(window).on('resize', setVideoSize)
}

export default PTMode

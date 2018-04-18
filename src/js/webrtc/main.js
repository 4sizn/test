function RTC (data) {
  // Cross browsing
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.MediaDevices.getUserMedia
  var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection
  var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription
  var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate

  var iceServers = {
    iceServers: data.iceServers
    // iceTransportPolicy: "relay"
  }
  var peerConnectionOptions = {
    'optional': [{
      'DtlsSrtpKeyAgreement': true
    }]
  }
  var mediaConstraints = {
    'mandatory': {
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': true
    }
  }
}

RTC.prototype.initialize = function () {

}

RTC.prototype.createPeerConnection = function () {
  console.log('createPeerConnection', arguments)

  var peer = {
    type: type,
    pc: null
  }
}

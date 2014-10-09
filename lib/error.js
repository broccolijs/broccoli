module.exports.replaceErrorMessage = replaceErrorMessage

function replaceErrorMessage(stack, message) {
  return stack.replace(/^Error[^\n]*/, 'Error: ' + message)
}

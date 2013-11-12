var reverseWord = Ember.Handlebars.makeBoundHelper(function(word) {
  return word.split('').reverse().join('');
});

export default reverseWord;

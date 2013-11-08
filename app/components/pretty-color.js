var PrettyColor = Ember.Component.extend({
    classNames: ['pretty-color'],
    attributeBindings: ['style'],
    style: function(){
      return 'color: ' + this.get('name') + ';';
    }.property('name')
});

export default PrettyColor;

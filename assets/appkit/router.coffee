Router = Ember.Router.extend() # ensure we don't share routes between all Router instances

Router.map ->
  @route('component-test')
  @route('helper-test')
  # @resource 'posts', ->
  #   @route('new')

`export default Router;`

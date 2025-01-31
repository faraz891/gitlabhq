# frozen_string_literal: true

require 'spec_helper'

RSpec.describe 'Project navbar' do
  include NavbarStructureHelper
  include WaitForRequests

  include_context 'project navbar structure'

  let_it_be(:user) { create(:user) }
  let_it_be(:project) { create(:project, :repository) }

  before do
    stub_feature_flags(sidebar_refactor: false)
    insert_package_nav(_('Operations'))
    insert_infrastructure_registry_nav
    stub_config(registry: { enabled: false })

    project.add_maintainer(user)
    sign_in(user)
  end

  it_behaves_like 'verified navigation bar' do
    before do
      visit project_path(project)
    end
  end

  context 'when value stream is available' do
    before do
      visit project_path(project)
    end

    it 'redirects to value stream when Analytics item is clicked' do
      page.within('.sidebar-top-level-items') do
        find('[data-qa-selector=analytics_anchor]').click
      end

      wait_for_requests

      expect(page).to have_current_path(project_cycle_analytics_path(project))
    end
  end

  context 'when pages are available' do
    before do
      stub_config(pages: { enabled: true })

      insert_after_sub_nav_item(
        _('Operations'),
        within: _('Settings'),
        new_sub_nav_item_name: _('Pages')
      )

      visit project_path(project)
    end

    it_behaves_like 'verified navigation bar'
  end

  context 'when container registry is available' do
    before do
      stub_config(registry: { enabled: true })

      insert_container_nav

      visit project_path(project)
    end

    it_behaves_like 'verified navigation bar'
  end

  context 'when sidebar refactor feature flag is on' do
    before do
      stub_feature_flags(sidebar_refactor: true)
      stub_config(registry: { enabled: true })

      insert_container_nav

      insert_after_sub_nav_item(
        _('Operations'),
        within: _('Settings'),
        new_sub_nav_item_name: _('Packages & Registries')
      )

      visit project_path(project)
    end

    it_behaves_like 'verified navigation bar'
  end
end

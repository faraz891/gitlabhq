# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Sidebars::Menu do
  let(:menu) { described_class.new(context) }
  let(:context) { Sidebars::Context.new(current_user: nil, container: nil) }

  describe '#all_active_routes' do
    it 'gathers all active routes of items and the current menu' do
      menu.add_item(Sidebars::MenuItem.new(title: 'foo1', link: 'foo1', active_routes: { path: %w(bar test) }))
      menu.add_item(Sidebars::MenuItem.new(title: 'foo2', link: 'foo2', active_routes: { controller: 'fooc' }))
      menu.add_item(Sidebars::MenuItem.new(title: 'foo3', link: 'foo3', active_routes: { controller: 'barc' }))

      allow(menu).to receive(:active_routes).and_return({ path: 'foo' })

      expect(menu.all_active_routes).to eq({ path: %w(foo bar test), controller: %w(fooc barc) })
    end
  end

  describe '#render?' do
    context 'when the menus has no items' do
      it 'returns false' do
        expect(menu.render?).to be false
      end
    end

    context 'when the menu has items' do
      it 'returns true' do
        menu.add_item(Sidebars::MenuItem.new(title: 'foo1', link: 'foo1', active_routes: {}))

        expect(menu.render?).to be true
      end
    end
  end

  describe '#insert_element_before' do
    let(:item1) { Sidebars::MenuItem.new(title: 'foo1', link: 'foo1', active_routes: {}, item_id: :foo1) }
    let(:item2) { Sidebars::MenuItem.new(title: 'foo2', link: 'foo2', active_routes: {}, item_id: :foo2) }
    let(:item3) { Sidebars::MenuItem.new(title: 'foo3', link: 'foo3', active_routes: {}, item_id: :foo3) }
    let(:list) { [item1, item2] }

    it 'adds element before the specific element class' do
      menu.insert_element_before(list, :foo2, item3)

      expect(list).to eq [item1, item3, item2]
    end

    it 'does not add nil elements' do
      menu.insert_element_before(list, :foo2, nil)

      expect(list).to eq [item1, item2]
    end

    context 'when reference element does not exist' do
      it 'adds the element to the top of the list' do
        menu.insert_element_before(list, :non_existent, item3)

        expect(list).to eq [item3, item1, item2]
      end
    end
  end

  describe '#insert_element_after' do
    let(:item1) { Sidebars::MenuItem.new(title: 'foo1', link: 'foo1', active_routes: {}, item_id: :foo1) }
    let(:item2) { Sidebars::MenuItem.new(title: 'foo2', link: 'foo2', active_routes: {}, item_id: :foo2) }
    let(:item3) { Sidebars::MenuItem.new(title: 'foo3', link: 'foo3', active_routes: {}, item_id: :foo3) }
    let(:list) { [item1, item2] }

    it 'adds element after the specific element class' do
      menu.insert_element_after(list, :foo1, item3)

      expect(list).to eq [item1, item3, item2]
    end

    it 'does not add nil elements' do
      menu.insert_element_after(list, :foo1, nil)

      expect(list).to eq [item1, item2]
    end

    context 'when reference element does not exist' do
      it 'adds the element to the end of the list' do
        menu.insert_element_after(list, :non_existent, item3)

        expect(list).to eq [item1, item2, item3]
      end
    end
  end
end

# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Banzai::Pipeline::PostProcessPipeline do
  subject { described_class.call(doc, context) }

  let_it_be(:project) { create(:project, :public, :repository) }

  let(:context) { { project: project, ref: 'master' } }

  context 'when a document only has upload links' do
    let(:doc) do
      <<-HTML.strip_heredoc
        <a href="/uploads/e90decf88d8f96fe9e1389afc2e4a91f/test.jpg">Relative Upload Link</a>
        <img src="/uploads/e90decf88d8f96fe9e1389afc2e4a91f/test.jpg">
      HTML
    end

    it 'does not make any Gitaly calls', :request_store do
      Gitlab::GitalyClient.reset_counts

      subject

      expect(Gitlab::GitalyClient.get_request_count).to eq(0)
    end
  end

  context 'when both upload and repository links are present' do
    let(:html) do
      <<-HTML.strip_heredoc
        <a href="/uploads/e90decf88d8f96fe9e1389afc2e4a91f/test.jpg">Relative Upload Link</a>
        <img src="/uploads/e90decf88d8f96fe9e1389afc2e4a91f/test.jpg">
        <a href="/test.jpg">Just a link</a>
      HTML
    end

    let(:doc) { HTML::Pipeline.parse(html) }

    it 'searches for attributes only once' do
      expect(doc).to receive(:search).once.and_call_original

      subject
    end

    context 'when "optimize_linkable_attributes" is disabled' do
      before do
        stub_feature_flags(optimize_linkable_attributes: false)
      end

      it 'searches for attributes twice' do
        expect(doc).to receive(:search).twice.and_call_original

        subject
      end
    end
  end
end

# frozen_string_literal: true

module Gitlab
  module Ci
    module Parsers
      ParserNotFoundError = Class.new(ParserError)

      def self.parsers
        {
          junit: ::Gitlab::Ci::Parsers::Test::Junit,
          cobertura: ::Gitlab::Ci::Parsers::Coverage::Cobertura,
          terraform: ::Gitlab::Ci::Parsers::Terraform::Tfplan,
          accessibility: ::Gitlab::Ci::Parsers::Accessibility::Pa11y,
          codequality: ::Gitlab::Ci::Parsers::Codequality::CodeClimate
        }
      end

      def self.fabricate!(file_type, *args, **kwargs)
        parsers.fetch(file_type.to_sym).new(*args, **kwargs)
      rescue KeyError
        raise ParserNotFoundError, "Cannot find any parser matching file type '#{file_type}'"
      end

      def self.instrument!
        parsers.values.each { |parser_class| parser_class.prepend(Parsers::Instrumentation) }
      end
    end
  end
end

Gitlab::Ci::Parsers.prepend_if_ee('::EE::Gitlab::Ci::Parsers')

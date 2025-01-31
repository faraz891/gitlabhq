# frozen_string_literal: true

module Users
  class BuildService < BaseService
    delegate :user_default_internal_regex_enabled?,
             :user_default_internal_regex_instance,
             to: :'Gitlab::CurrentSettings.current_application_settings'
    attr_reader :identity_params

    def initialize(current_user, params = {})
      @current_user = current_user
      @params = params.dup
      @identity_params = params.slice(*identity_attributes)
    end

    def execute(skip_authorization: false)
      @skip_authorization = skip_authorization

      raise Gitlab::Access::AccessDeniedError unless skip_authorization || can_create_user?

      user_params = build_user_params
      user = User.new(user_params)

      if current_user&.admin?
        @reset_token = user.generate_reset_token if params[:reset_password]

        if user_params[:force_random_password]
          random_password = User.random_password
          user.password = user.password_confirmation = random_password
        end
      end

      build_identity(user)

      Users::UpdateCanonicalEmailService.new(user: user).execute

      user
    end

    private

    attr_reader :skip_authorization

    def identity_attributes
      [:extern_uid, :provider]
    end

    def build_identity(user)
      return if identity_params.empty?

      user.identities.build(identity_params)
    end

    def can_create_user?
      (current_user.nil? && Gitlab::CurrentSettings.allow_signup?) || current_user&.admin?
    end

    # Allowed params for creating a user (admins only)
    def admin_create_params
      [
        :access_level,
        :admin,
        :avatar,
        :bio,
        :can_create_group,
        :color_scheme_id,
        :email,
        :external,
        :force_random_password,
        :hide_no_password,
        :hide_no_ssh_key,
        :linkedin,
        :name,
        :password,
        :password_automatically_set,
        :password_expires_at,
        :projects_limit,
        :remember_me,
        :skip_confirmation,
        :skype,
        :theme_id,
        :twitter,
        :username,
        :website_url,
        :private_profile,
        :organization,
        :location,
        :public_email,
        :user_type,
        :note,
        :view_diffs_file_by_file
      ]
    end

    # Allowed params for user signup
    def signup_params
      [
        :email,
        :password_automatically_set,
        :name,
        :first_name,
        :last_name,
        :password,
        :username,
        :user_type
      ]
    end

    def build_user_params
      if current_user&.admin?
        user_params = params.slice(*admin_create_params)

        if params[:reset_password]
          user_params.merge!(force_random_password: true, password_expires_at: nil)
        end
      else
        allowed_signup_params = signup_params
        allowed_signup_params << :skip_confirmation if allow_caller_to_request_skip_confirmation?

        user_params = params.slice(*allowed_signup_params)
        if assign_skip_confirmation_from_settings?(user_params)
          user_params[:skip_confirmation] = skip_user_confirmation_email_from_setting
        end

        fallback_name = "#{user_params[:first_name]} #{user_params[:last_name]}"

        if user_params[:name].blank? && fallback_name.present?
          user_params = user_params.merge(name: fallback_name)
        end
      end

      user_params[:created_by_id] = current_user&.id

      if user_default_internal_regex_enabled? && !user_params.key?(:external)
        user_params[:external] = user_external?
      end

      user_params.delete(:user_type) unless project_bot?(user_params[:user_type])

      user_params
    end

    def allow_caller_to_request_skip_confirmation?
      skip_authorization
    end

    def assign_skip_confirmation_from_settings?(user_params)
      user_params[:skip_confirmation].nil?
    end

    def skip_user_confirmation_email_from_setting
      !Gitlab::CurrentSettings.send_user_confirmation_email
    end

    def user_external?
      user_default_internal_regex_instance.match(params[:email]).nil?
    end

    def project_bot?(user_type)
      user_type&.to_sym == :project_bot
    end
  end
end

Users::BuildService.prepend_if_ee('EE::Users::BuildService')

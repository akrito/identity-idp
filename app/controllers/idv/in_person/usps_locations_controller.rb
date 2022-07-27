require 'json'

module Idv
  module InPerson
    class UspsLocationsController < ApplicationController
      include IdvSession
      include UspsInPersonProofing

      # get the list of all pilot Post Office locations
      def index
        usps_response = []
        begin
          usps_response = Proofer.new.request_pilot_facilities
        rescue Faraday::ConnectionFailed => _error
          nil
        end

        render json: usps_response.to_json
      end

      # save the Post Office location the user selected to the session
      def update
        idv_session.applicant ||= {}
        idv_session.applicant[:selected_location_details] = permitted_params.as_json

        render json: { success: true }, status: :ok
      end

      # return the Post Office location the user selected from the session
      def show
        selected_location = idv_session.applicant&.[](:selected_location_details) || {}

        # camel case keys
        returned_location = {}
        selected_location.keys.each do |key|
          returned_location[key.camelize(:lower)] = selected_location[key]
        end

        render json: returned_location.to_json, status: :ok
      end

      protected

      def permitted_params
        params.require(:usps_location).permit(
          :formatted_city_state_zip,
          :name,
          :phone,
          :saturday_hours,
          :street_address,
          :sunday_hours,
          :weekday_hours,
        )
      end
    end
  end
end

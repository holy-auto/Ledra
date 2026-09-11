Pod::Spec.new do |s|
  s.name           = 'LedraWatchBridge'
  s.version        = '1.0.0'
  s.summary        = 'Connects Ledra work sessions between iPhone and Apple Watch.'
  s.description    = 'An Expo module backed by WatchConnectivity and ActivityKit.'
  s.author         = 'Ledra'
  s.homepage       = 'https://ledra.jp'
  s.platforms      = { :ios => '16.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.default_subspecs = 'Bridge'

  s.subspec 'ActivityShared' do |ss|
    ss.source_files = 'LedraWorkActivityAttributes.swift'
    ss.frameworks = 'ActivityKit'
  end

  s.subspec 'Bridge' do |ss|
    ss.source_files = 'LedraWatchBridgeModule.swift', 'LedraWorkActivityManager.swift'
    ss.frameworks = 'ActivityKit', 'WatchConnectivity', 'UserNotifications', 'UIKit'
    ss.dependency 'ExpoModulesCore'
    ss.dependency 'LedraWatchBridge/ActivityShared'
  end
end
